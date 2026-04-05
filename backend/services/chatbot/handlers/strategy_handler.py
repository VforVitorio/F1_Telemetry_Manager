"""
Strategy Query Handler

Routes strategy-intent chat messages to the N25–N31 agent pipeline.

When the chat context carries a `lap_state` dict (populated by the frontend
when a race replay is active), this handler runs the full orchestrator and
returns the StrategyRecommendation as a formatted natural-language response.

When no lap_state is present it falls back to a general strategy Q&A via the
LLM, without calling the ML models.
"""

import logging
import sys
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from .base_handler import BaseHandler
from backend.services.chatbot.lmstudio_service import (
    LMStudioError,
    build_messages,
    send_message,
)

# ---------------------------------------------------------------------------
# Repo-root path injection — same pattern as strategy endpoint
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE
while not (_REPO_ROOT / ".git").exists():
    _REPO_ROOT = _REPO_ROOT.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a Formula 1 strategy expert assistant embedded in a real-time telemetry
and race simulation system.  You have access to ML models that predict lap times,
tyre degradation, overtake probability, safety-car likelihood, pit stop duration,
and undercut success.

When a race state is available (current lap, compound, tyre life, gap to rival),
you provide a concrete pit-stop recommendation with confidence and reasoning.

When no live race state is available, answer general strategy questions clearly
and concisely, citing relevant F1 strategy concepts (tyre delta, undercut window,
overcut risk, safety-car timing, track position value).

Keep responses under 200 words unless the user explicitly asks for detail.
"""


def _to_dict(obj: Any) -> Dict[str, Any]:
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    try:
        return obj.model_dump()
    except AttributeError:
        pass
    try:
        return obj.dict()
    except AttributeError:
        pass
    return vars(obj)


def _format_recommendation(rec: Any) -> str:
    """Render a StrategyRecommendation as a chat-friendly string."""
    d = _to_dict(rec)
    action      = d.get("action", "UNKNOWN")
    confidence  = d.get("confidence", 0.0)
    reasoning   = d.get("reasoning", "")
    mc          = d.get("mc_scores", {})

    lines = [
        f"**Recommended action:** {action}  (confidence {confidence:.0%})",
        "",
        reasoning,
    ]
    if mc:
        lines += [
            "",
            "**Monte-Carlo scores:**",
            f"- STAY OUT: {mc.get('STAY_OUT', 0):.3f}",
            f"- PIT NOW:  {mc.get('PIT_NOW', 0):.3f}",
            f"- UNDERCUT: {mc.get('UNDERCUT', 0):.3f}",
            f"- OVERCUT:  {mc.get('OVERCUT', 0):.3f}",
        ]
    return "\n".join(lines)


class StrategyHandler(BaseHandler):
    """
    Handler for strategy-intent chat queries.

    When the request context contains a `lap_state` key, the full N31
    orchestrator pipeline is invoked and the result is formatted as a
    structured strategy recommendation.

    Without a lap_state the handler falls back to LLM-only strategy Q&A
    using a dedicated strategy system prompt.
    """

    def handle(
        self,
        message: str,
        image: Optional[str] = None,
        chat_history: Optional[list] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        self._log_request(message, **kwargs)

        lap_state = (context or {}).get("lap_state")

        if lap_state:
            return self._handle_with_pipeline(
                message, lap_state, context, chat_history, **kwargs
            )
        return self._handle_text_only(message, image, chat_history, context, **kwargs)

    # ------------------------------------------------------------------

    def _handle_with_pipeline(
        self,
        message: str,
        lap_state: dict,
        context: Dict[str, Any],
        chat_history: Optional[list],
        **kwargs,
    ) -> Dict[str, Any]:
        """Run the N31 orchestrator and return a formatted recommendation."""
        try:
            import pandas as pd
            from src.agents.strategy_orchestrator import (
                RaceState,
                run_strategy_orchestrator_from_state,
            )

            # Load laps_df once
            laps_path = _REPO_ROOT / "data" / "processed" / "laps_featured_2025.parquet"
            if not laps_path.exists():
                raise FileNotFoundError(
                    f"Featured parquet not found: {laps_path}. "
                    "Run the data pipeline first."
                )
            laps_df = pd.read_parquet(laps_path)

            d = lap_state.get("driver", {})
            w = lap_state.get("weather", {})

            race_state = RaceState(
                driver=d.get("driver", "UNK"),
                lap=lap_state.get("lap_number", 1),
                total_laps=lap_state.get("session_meta", {}).get("total_laps", 57),
                position=d.get("position", 10),
                compound=d.get("compound", "MEDIUM"),
                tyre_life=d.get("tyre_life", 1),
                gap_ahead_s=float(context.get("gap_ahead_s", 2.0)),
                pace_delta_s=float(context.get("pace_delta_s", 0.0)),
                air_temp=float(w.get("air_temp", 25.0)),
                track_temp=float(w.get("track_temp", 35.0)),
                rainfall=bool(w.get("rainfall", False)),
                risk_tolerance=float(context.get("risk_tolerance", 0.5)),
            )

            rec = run_strategy_orchestrator_from_state(
                race_state=race_state,
                laps_df=laps_df,
                lap_state=lap_state,
            )

            response_text = _format_recommendation(rec)
            self._log_response(len(response_text))

            return {
                "response": response_text,
                "llm_model": None,
                "tokens_used": None,
                "metadata": {
                    "handler_type": "strategy",
                    "mode": "pipeline",
                    "action": _to_dict(rec).get("action"),
                    "confidence": _to_dict(rec).get("confidence"),
                },
            }

        except Exception as exc:
            logger.error("Strategy pipeline error: %s", exc, exc_info=True)
            # Degrade gracefully to text-only if the ML pipeline fails
            fallback = (
                f"I encountered an error running the strategy models: {exc}. "
                "I'll answer based on general F1 strategy knowledge instead.\n\n"
            )
            text_result = self._handle_text_only(
                message, None, chat_history, {}, **kwargs
            )
            text_result["response"] = fallback + text_result["response"]
            text_result["metadata"]["mode"] = "fallback_text"
            return text_result

    def _handle_text_only(
        self,
        message: str,
        image: Optional[str],
        chat_history: Optional[list],
        context: Optional[Dict[str, Any]],
        **kwargs,
    ) -> Dict[str, Any]:
        """Fall back to LLM-only strategy Q&A."""
        try:
            messages = build_messages(
                user_message=message,
                image_base64=image,
                system_prompt=_SYSTEM_PROMPT,
                chat_history=chat_history,
                context=context,
            )
            response = send_message(
                messages=messages,
                model=kwargs.get("model"),
                temperature=kwargs.get("temperature", 0.5),
                max_tokens=kwargs.get("max_tokens", 600),
                stream=False,
            )

            if "choices" in response and response["choices"]:
                content = response["choices"][0]["message"]["content"]
                self._log_response(len(content))
                return {
                    "response": content,
                    "llm_model": response.get("model"),
                    "tokens_used": response.get("usage", {}).get("total_tokens"),
                    "metadata": {"handler_type": "strategy", "mode": "text_only"},
                }
            raise ValueError("Empty response from LLM")

        except LMStudioError as exc:
            logger.error("LMStudio error in StrategyHandler: %s", exc)
            return {
                "response": (
                    "I can't reach the LLM service right now. "
                    "Please make sure LM Studio is running on port 1234."
                ),
                "llm_model": None,
                "tokens_used": None,
                "metadata": {"handler_type": "strategy", "mode": "text_only", "error": str(exc)},
            }
        except Exception as exc:
            logger.error("StrategyHandler error: %s", exc, exc_info=True)
            return {
                "response": f"Error processing strategy query: {exc}",
                "llm_model": None,
                "tokens_used": None,
                "metadata": {"handler_type": "strategy", "error": str(exc)},
            }
