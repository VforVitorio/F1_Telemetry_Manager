"""
Tool Parameter Extractor — Derives which MCP tool to call and with what
parameters from a free-text user message.

Uses a two-stage approach:
1. **LLM-based**: send the message to LM Studio with a structured prompt
   that requests JSON output.  Works well when the model follows instructions.
2. **Regex/keyword fallback**: if the LLM response is unparseable, fall back
   to deterministic extraction using driver codes, GP name fuzzy-matching,
   lap-number patterns, and keyword-to-tool mapping.
"""

from __future__ import annotations

import json
import logging
import re
from difflib import get_close_matches
from typing import Optional

from backend.models.tool_schemas import ToolCall, ToolCallParams, ToolName

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# 3-letter codes for the 2023-2025 grids
_DRIVER_CODES = {
    "VER", "PER", "LEC", "SAI", "HAM", "RUS", "ANT", "NOR", "PIA",
    "ALO", "STR", "GAS", "OCO", "DOO", "COL", "ALB", "SAR", "TSU",
    "RIC", "LAW", "HAD", "BOT", "ZHO", "HUL", "BOR", "MAG", "BEA",
}

# Keywords → ToolName (order matters — first match wins)
_KEYWORD_TOOL_MAP: list[tuple[list[str], ToolName]] = [
    (["regulation", "rule", "article", "fia", "sporting code"], ToolName.QUERY_REGULATIONS),
    (["recommend", "strategy", "full analysis", "what should"],   ToolName.RECOMMEND_STRATEGY),
    (["compare", "versus", "vs", "head to head"],                 ToolName.COMPARE_DRIVERS),
    (["telemetry", "speed trace", "throttle", "brake trace"],     ToolName.GET_TELEMETRY),
    (["lap times", "laptimes", "lap time chart"],                 ToolName.GET_LAP_TIMES),
    (["race data", "race overview", "full race"],                 ToolName.GET_RACE_DATA),
    (["tire", "tyre", "degradation", "cliff", "compound"],        ToolName.PREDICT_TIRE),
    (["pit", "stop", "undercut", "overcut", "box box"],           ToolName.PREDICT_PIT),
    (["overtake", "pass", "drs", "safety car", "sc prob"],        ToolName.PREDICT_SITUATION),
    (["pace", "lap time", "laptime", "fast", "slow"],             ToolName.PREDICT_PACE),
    (["radio", "message", "team radio"],                          ToolName.ANALYZE_RADIO),
    (["gps", "races", "calendar", "events"],                      ToolName.LIST_GPS),
    (["drivers", "who raced", "driver list"],                     ToolName.LIST_DRIVERS),
]

# Structured prompt sent to LM Studio for JSON extraction
_EXTRACTION_PROMPT = """\
You are a parameter extractor for an F1 strategy tool system.
Given the user message below, determine which tool to call and extract the parameters.

Available tools:
- predict_pace: lap time prediction (needs gp, driver, lap)
- predict_tire: tyre degradation analysis (needs gp, driver, lap)
- predict_situation: overtake + safety car probability (needs gp, driver, lap)
- predict_pit: pit stop strategy recommendation (needs gp, driver, lap)
- analyze_radio: team radio NLP analysis (needs gp, driver, lap)
- query_regulations: FIA rule lookup (needs question)
- recommend_strategy: full strategy analysis (needs gp, driver, lap)
- list_gps: list available Grand Prix (optional year)
- list_drivers: list drivers for a GP (needs gp)

Return ONLY valid JSON with no additional text:
{{"tool": "<tool_name>", "params": {{"gp": "...", "driver": "...", "lap": N, "year": N, "question": "..."}}}}

Use null for parameters you cannot determine.

User message: {message}"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class ToolParameterExtractor:
    """Extracts a structured ToolCall from a natural-language user message.

    Tries LLM-based extraction first, then falls back to regex/keyword
    heuristics.  The caller can inspect ``ToolCall.confidence`` to decide
    whether to proceed or ask the user for clarification.
    """

    def __init__(self, available_gps: list[str] | None = None):
        self._available_gps = available_gps or []

    # -- public --

    def extract(self, message: str) -> ToolCall:
        """Extract tool name and parameters from *message*.

        Returns a ToolCall with confidence between 0 and 1.  A confidence
        below 0.3 typically means the message is too vague for a tool call.
        """
        llm_result = self._try_llm_extraction(message)
        if llm_result and llm_result.confidence >= 0.6:
            return llm_result

        regex_result = self._regex_extraction(message)
        if llm_result and regex_result:
            return self._merge(llm_result, regex_result)

        return regex_result or self._low_confidence_fallback(message)

    def refresh_gps(self, gps: list[str]) -> None:
        """Update the list of known GP names (used for fuzzy matching)."""
        self._available_gps = gps

    # -- LLM-based extraction --

    def _try_llm_extraction(self, message: str) -> Optional[ToolCall]:
        """Ask LM Studio to extract parameters as JSON."""
        try:
            from backend.services.chatbot.lmstudio_service import send_message, build_messages

            prompt = _EXTRACTION_PROMPT.format(message=message)
            messages = build_messages(prompt)
            response = send_message(messages, temperature=0.0, max_tokens=200)

            raw = response.get("content", "") if isinstance(response, dict) else str(response)
            return self._parse_llm_json(raw)
        except Exception:
            logger.debug("LLM extraction failed, falling back to regex", exc_info=True)
            return None

    def _parse_llm_json(self, raw: str) -> Optional[ToolCall]:
        """Parse the JSON blob from the LLM response."""
        json_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not json_match:
            return None

        try:
            data = json.loads(json_match.group())
        except json.JSONDecodeError:
            return None

        tool_str = data.get("tool", "")
        try:
            tool_name = ToolName(tool_str)
        except ValueError:
            return None

        params_raw = data.get("params", {})
        gp = self._normalize_gp(params_raw.get("gp")) if params_raw.get("gp") else None
        driver = self._normalize_driver(params_raw.get("driver"))
        lap = _safe_int(params_raw.get("lap"))

        params = ToolCallParams(
            gp=gp,
            driver=driver,
            lap=lap,
            year=_safe_int(params_raw.get("year")) or 2025,
            question=params_raw.get("question"),
        )

        confidence = self._compute_confidence(tool_name, params)
        return ToolCall(tool=tool_name, params=params, confidence=confidence)

    # -- Regex/keyword fallback --

    def _regex_extraction(self, message: str) -> Optional[ToolCall]:
        """Deterministic extraction using patterns and keywords."""
        upper = message.upper()
        all_drivers = self._extract_all_drivers(upper)
        driver = all_drivers[0] if all_drivers else None
        driver2 = all_drivers[1] if len(all_drivers) >= 2 else None
        lap = self._extract_lap(message)
        gp = self._extract_gp(message)
        tool = self._classify_tool(message.lower())

        # Two drivers + compare keyword → compare_drivers
        if driver and driver2 and tool == ToolName.COMPARE_DRIVERS:
            pass  # already correct
        # Two drivers without keyword → default to compare
        elif driver and driver2 and tool is None:
            tool = ToolName.COMPARE_DRIVERS
        # If we found driver+GP+lap but no specific tool keyword → full recommendation
        elif tool is None and driver and gp and lap:
            tool = ToolName.RECOMMEND_STRATEGY
        elif tool is None:
            return None

        params = ToolCallParams(
            gp=gp,
            driver=driver,
            driver2=driver2,
            lap=lap,
            question=message if tool == ToolName.QUERY_REGULATIONS else None,
        )

        confidence = self._compute_confidence(tool, params)
        return ToolCall(tool=tool, params=params, confidence=confidence)

    # -- Helpers --

    def _extract_driver(self, upper_msg: str) -> Optional[str]:
        """Find the first 3-letter F1 driver code in the message."""
        for code in self._extract_all_drivers(upper_msg):
            return code
        return None

    def _extract_all_drivers(self, upper_msg: str) -> list[str]:
        """Find all 3-letter F1 driver codes in the message."""
        words = re.findall(r"\b[A-Z]{3}\b", upper_msg)
        return [w for w in words if w in _DRIVER_CODES]

    def _extract_lap(self, message: str) -> Optional[int]:
        """Extract a lap number from patterns like 'lap 30', 'L30', 'vuelta 30'."""
        patterns = [
            r"(?:lap|l|vuelta)\s*(\d{1,2})",
            r"(\d{1,2})\s*(?:lap|vuelta)",
        ]
        for pat in patterns:
            m = re.search(pat, message, re.IGNORECASE)
            if m:
                val = int(m.group(1))
                if 1 <= val <= 80:
                    return val
        return None

    def _extract_gp(self, message: str) -> Optional[str]:
        """Fuzzy-match a GP name against the known list."""
        if not self._available_gps:
            return self._extract_gp_heuristic(message)

        lower = message.lower()
        matches = get_close_matches(lower, [g.lower() for g in self._available_gps], n=1, cutoff=0.5)
        if matches:
            idx = [g.lower() for g in self._available_gps].index(matches[0])
            return self._available_gps[idx]
        return self._extract_gp_heuristic(message)

    def _extract_gp_heuristic(self, message: str) -> Optional[str]:
        """Keyword-based GP detection when no GP list is available."""
        # Values must match GP_Name in the featured parquet (circuit/city names)
        gp_keywords = {
            "bahrain": "Sakhir", "sakhir": "Sakhir",
            "jeddah": "Jeddah", "saudi": "Jeddah",
            "australia": "Melbourne", "melbourne": "Melbourne",
            "japan": "Suzuka", "suzuka": "Suzuka",
            "china": "Shanghai", "shanghai": "Shanghai",
            "miami": "Miami",
            "imola": "Imola", "emilia": "Imola",
            "monaco": "Monaco",
            "canada": "Montréal", "montreal": "Montréal",
            "spain": "Barcelona", "barcelona": "Barcelona",
            "austria": "Spielberg", "spielberg": "Spielberg",
            "britain": "Silverstone", "silverstone": "Silverstone",
            "hungary": "Budapest", "budapest": "Budapest",
            "belgium": "Spa-Francorchamps", "spa": "Spa-Francorchamps",
            "netherlands": "Zandvoort", "zandvoort": "Zandvoort",
            "italy": "Monza", "monza": "Monza",
            "azerbaijan": "Baku", "baku": "Baku",
            "singapore": "Marina Bay", "marina bay": "Marina Bay",
            "united states": "Austin", "austin": "Austin", "cota": "Austin",
            "mexico": "Mexico City",
            "brazil": "São Paulo", "interlagos": "São Paulo", "sao paulo": "São Paulo",
            "las vegas": "Las Vegas",
            "qatar": "Lusail", "lusail": "Lusail",
            "abu dhabi": "Yas Island", "yas marina": "Yas Island",
        }
        lower = message.lower()
        for keyword, gp_name in gp_keywords.items():
            if keyword in lower:
                return gp_name
        return None

    def _normalize_gp(self, gp_raw: Optional[str]) -> Optional[str]:
        """Normalize a GP name against the known list or heuristic."""
        if not gp_raw:
            return None
        if self._available_gps:
            matches = get_close_matches(gp_raw.lower(), [g.lower() for g in self._available_gps], n=1, cutoff=0.4)
            if matches:
                idx = [g.lower() for g in self._available_gps].index(matches[0])
                return self._available_gps[idx]
        return self._extract_gp_heuristic(gp_raw)

    def _normalize_driver(self, driver_raw: Optional[str]) -> Optional[str]:
        """Normalize a driver string to a 3-letter code."""
        if not driver_raw:
            return None
        upper = driver_raw.upper().strip()
        if upper in _DRIVER_CODES:
            return upper
        code = upper[:3]
        if code in _DRIVER_CODES:
            return code
        return None

    def _classify_tool(self, lower_msg: str) -> Optional[ToolName]:
        """Map message keywords to the most likely tool."""
        for keywords, tool in _KEYWORD_TOOL_MAP:
            if any(kw in lower_msg for kw in keywords):
                return tool
        return None

    def _compute_confidence(self, tool: ToolName, params: ToolCallParams) -> float:
        """Score how complete the extraction is (0.0 – 1.0)."""
        if tool == ToolName.QUERY_REGULATIONS:
            return 0.9 if params.question else 0.4
        if tool in {ToolName.LIST_GPS, ToolName.LIST_DRIVERS, ToolName.GET_LAP_RANGE}:
            return 0.8

        score = 0.3
        if params.gp:
            score += 0.25
        if params.driver:
            score += 0.25
        if params.lap:
            score += 0.2
        return min(score, 1.0)

    def _merge(self, llm: ToolCall, regex: ToolCall) -> ToolCall:
        """Merge LLM and regex results, preferring the more complete one."""
        merged_params = ToolCallParams(
            gp=llm.params.gp or regex.params.gp,
            driver=llm.params.driver or regex.params.driver,
            lap=llm.params.lap or regex.params.lap,
            year=llm.params.year,
            risk_tolerance=llm.params.risk_tolerance,
            question=llm.params.question or regex.params.question,
        )
        tool = llm.tool if llm.confidence >= regex.confidence else regex.tool
        confidence = max(llm.confidence, regex.confidence)
        return ToolCall(tool=tool, params=merged_params, confidence=confidence)

    def _low_confidence_fallback(self, message: str) -> ToolCall:
        """Return a low-confidence ToolCall when nothing matched."""
        return ToolCall(
            tool=ToolName.RECOMMEND_STRATEGY,
            params=ToolCallParams(question=message),
            confidence=0.1,
        )


# ---------------------------------------------------------------------------
# Module-level utilities
# ---------------------------------------------------------------------------

def _safe_int(val) -> Optional[int]:
    """Convert a value to int, returning None on failure."""
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None
