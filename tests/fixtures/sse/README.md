# Chat SSE transcript fixtures

Recorded `event: <name>\ndata: <json>\n\n` streams from the chat
`tool-message-stream` endpoint, driven by the FakeOpenAI stub.

- `chat_plain.sse` — a no-tool turn: `stage` × N → `token` → `done`.
- `chat_tool_call.sse` — a tool turn: `stage` × N → `tool_result` → `stage` → `token` → `done`.

**One fixture, two consumers.** These files are the shared wire contract between
the Python grammar tests (`tests/test_chat_sse.py`) and the SPA's TypeScript
`RaceFeed` parser (migration W0). Both parse the *same* bytes, so client and
server cannot drift apart silently (Testing audit T-7).

**Regenerate** with `python tests/fixtures/sse/generate_transcripts.py` (from the
submodule root, with port 1234 free). Commit the regenerated files in the same PR
as any SSE grammar change — the fixture diff is the contract diff.
