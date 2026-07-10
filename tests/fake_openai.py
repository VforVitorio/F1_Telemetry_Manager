"""In-process FakeOpenAI stub — an OpenAI-compatible HTTP server for tests.

Why this exists
---------------
Every LLM-touching path in F1 StratLab speaks the OpenAI wire protocol against a
*real socket* at ``http://localhost:1234/v1``: the backend chat engine
(``llm_service.send_message`` via ``requests.post``) and, in the parent repo, the
six sub-agents + orchestrator (``ChatOpenAI(base_url=...:1234/v1)``).  Those call
sites are hardcoded and ``src/agents`` is untouchable, so the test double cannot
be an in-memory ASGI app monkeypatched over the client — it has to be an actual
listening HTTP server on port 1234.  This module is exactly that: a stdlib
``http.server`` bound to ``127.0.0.1:1234`` returning *scripted* completions, so a
test can drive the whole chat/agent plumbing with no live model, no network, and
zero changes to production code (Testing audit T-3, the harness linchpin).

What it is NOT
--------------
A fidelity model of a real LLM.  It cannot catch prompt-quality regressions or
provider quirks — that is the job of the (non-gating, local) real-LM-Studio smoke
tier.  Its job is *plumbing* correctness: response shapes, tool-call tuples, SSE
grammar, routing — which is where every escaped bug in the Testing audit lived.
Never a real provider, never Anthropic.

Scripting model
---------------
Responses are a FIFO queue: each ``/v1/chat/completions`` request pops the next
scripted reply.  A chat turn that calls a tool makes two LLM round-trips (the
tool-choice call, then the summary call), so scripting is by call order::

    fake_openai.push_tool_call("predict_pace", {"driver": "VER"})  # round-trip 1
    fake_openai.push_text("VER is projected 0.3s faster next lap.")  # round-trip 2

When the queue is empty the stub returns a benign default reply (so a stray extra
call never 500s a test) and still records the request for inspection.
"""

from __future__ import annotations

import json
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

# ponytail: host/port hardcoded to match the app's hardcoded base_url. An
# env-configurable port is a separate enabler (Testing T-3) — add it only if a
# dev's real LM Studio on :1234 makes the collision-skip below actually annoying.
STUB_HOST = "127.0.0.1"
STUB_PORT = 1234

_DEFAULT_MODEL = "fake-model"


def build_completion(
    content: str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
    *,
    model: str = _DEFAULT_MODEL,
    total_tokens: int = 11,
) -> dict[str, Any]:
    """Build an OpenAI ``chat.completion`` response dict.

    Matches the exact shape the backend's extractors read: ``choices[0].message``
    (``content`` and/or ``tool_calls``), ``model`` and ``usage.total_tokens`` (the
    SSE ``done`` metadata).  ``content`` is ``None`` on a pure tool-call turn, per
    the OpenAI contract.
    """
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    completion = {
        "id": "chatcmpl-fake",
        "object": "chat.completion",
        "created": 0,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": "tool_calls" if tool_calls else "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": total_tokens,
            "total_tokens": total_tokens,
        },
    }
    return completion


def build_tool_call(
    name: str,
    arguments: dict[str, Any] | str | None = None,
    *,
    call_id: str = "call_fake",
) -> dict[str, Any]:
    """Build one OpenAI ``tool_call``.

    ``arguments`` is JSON-*encoded* in the wire protocol (a string, not an object),
    so a dict is serialised here — the backend's ``coerce_tool_arguments`` decodes
    it again.  Passing a raw string through lets a test script malformed JSON to
    exercise that coercion path.
    """
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, str):
        arguments = json.dumps(arguments)
    tool_call = {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": arguments},
    }
    return tool_call


class _StubHandler(BaseHTTPRequestHandler):
    """Serves the two endpoints the app hits; all state lives on the server."""

    # Silence per-request stderr logging so the pytest output stays readable.
    def log_message(self, *args: Any) -> None:  # noqa: D401
        pass

    def do_GET(self) -> None:
        if self._path_is("/v1/models"):
            self._send_json(200, {"object": "list", "data": [{"id": _DEFAULT_MODEL, "object": "model"}]})
        else:
            self._send_json(404, {"error": {"message": f"no route for GET {self.path}"}})

    def do_POST(self) -> None:
        body = self._read_json_body()
        self.server.received.append(body)  # type: ignore[attr-defined]

        if not self._path_is("/v1/chat/completions"):
            self._send_json(404, {"error": {"message": f"no route for POST {self.path}"}})
            return

        status, payload = self.server.next_response()  # type: ignore[attr-defined]
        self._send_json(status, payload)

    def _path_is(self, suffix: str) -> bool:
        """True when the request path ends with *suffix* (ignoring a trailing slash)."""
        return self.path.rstrip("/").endswith(suffix)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return {"_unparsed": raw.decode("utf-8", "replace")}

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class _StubHTTPServer(ThreadingHTTPServer):
    """Threading HTTP server holding the scripted queue and received-request log."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int]) -> None:
        super().__init__(address, _StubHandler)
        self.script: deque[tuple[int, dict[str, Any]]] = deque()
        self.received: list[dict[str, Any]] = []
        self.default_response: tuple[int, dict[str, Any]] = (
            200,
            build_completion(content="(fake default reply)"),
        )

    def next_response(self) -> tuple[int, dict[str, Any]]:
        """Pop the next scripted (status, payload), or the benign default."""
        if self.script:
            return self.script.popleft()
        return self.default_response


class FakeOpenAIServer:
    """Handle to a running FakeOpenAI stub — script replies, inspect requests.

    Bound to :1234 on construction (raises ``OSError`` if the port is taken — the
    fixture turns that into a skip so a dev's live LM Studio never fails the run).
    Every ``push_*`` returns ``self`` so a multi-round-trip turn can be scripted in
    one chained expression.
    """

    def __init__(self) -> None:
        self._server = _StubHTTPServer((STUB_HOST, STUB_PORT))
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    # ---- scripting -------------------------------------------------------
    def push_text(self, text: str, **kwargs: Any) -> "FakeOpenAIServer":
        """Enqueue a plain-text completion (no tool call)."""
        self._server.script.append((200, build_completion(content=text, **kwargs)))
        return self

    def push_tool_call(
        self,
        name: str,
        arguments: dict[str, Any] | str | None = None,
        *,
        call_id: str = "call_fake",
    ) -> "FakeOpenAIServer":
        """Enqueue a tool-call completion (content ``None``, one ``tool_calls`` entry)."""
        tool_calls = [build_tool_call(name, arguments, call_id=call_id)]
        self._server.script.append((200, build_completion(content=None, tool_calls=tool_calls)))
        return self

    def push_error(self, status: int = 500, message: str = "stub error") -> "FakeOpenAIServer":
        """Enqueue an HTTP error, to exercise the provider-failure path."""
        self._server.script.append((status, {"error": {"message": message}}))
        return self

    # ---- inspection ------------------------------------------------------
    @property
    def requests(self) -> list[dict[str, Any]]:
        """The parsed request bodies received so far, in order."""
        return self._server.received

    @property
    def url(self) -> str:
        return f"http://{STUB_HOST}:{STUB_PORT}/v1"

    # ---- lifecycle -------------------------------------------------------
    def shutdown(self) -> None:
        self._server.shutdown()
        self._server.server_close()
