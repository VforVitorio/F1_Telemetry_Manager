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

# Surname → 3-letter code for natural-language queries.  Keys are
# lowercase and unaccented so the matcher can be case/diacritic-agnostic.
_DRIVER_SURNAMES = {
    "verstappen": "VER", "perez": "PER", "leclerc": "LEC", "sainz": "SAI",
    "hamilton": "HAM", "russell": "RUS", "antonelli": "ANT", "norris": "NOR",
    "piastri": "PIA", "alonso": "ALO", "stroll": "STR", "gasly": "GAS",
    "ocon": "OCO", "doohan": "DOO", "colapinto": "COL", "albon": "ALB",
    "sargeant": "SAR", "tsunoda": "TSU", "ricciardo": "RIC", "lawson": "LAW",
    "hadjar": "HAD", "bottas": "BOT", "zhou": "ZHO", "hulkenberg": "HUL",
    "bortoleto": "BOR", "magnussen": "MAG", "bearman": "BEA",
}

# Keywords → ToolName (order matters — first match wins).  Mixes English
# and Spanish variants so mixed-language chat messages route correctly.
_KEYWORD_TOOL_MAP: list[tuple[list[str], ToolName]] = [
    (["regulation", "rule", "article", "fia", "sporting code",
      "reglamento", "norma", "artículo", "articulo"],             ToolName.QUERY_REGULATIONS),
    (["recommend", "strategy", "full analysis", "what should",
      "recomienda", "recomendación", "recomendacion",
      "qué hago", "que hago", "estrategia"],                      ToolName.RECOMMEND_STRATEGY),
    (["compare", "versus", " vs ", "head to head",
      "compara", "comparar", "comparación", "comparacion",
      "contra"],                                                  ToolName.COMPARE_DRIVERS),
    (["telemetry", "speed trace", "throttle", "brake trace",
      "telemetría", "telemetria", "traza de velocidad",
      "acelerador", "freno"],                                     ToolName.GET_TELEMETRY),
    (["lap times", "laptimes", "lap time chart",
      "tiempos de vuelta", "tiempos por vuelta",
      "tiempos de", "tiempos por"],                               ToolName.GET_LAP_TIMES),
    (["race data", "race overview", "full race",
      "datos de carrera", "resumen de carrera", "toda la carrera",
      "posiciones", "evolución de la carrera", "evolucion de la carrera"],
                                                                  ToolName.GET_RACE_DATA),
    (["tire", "tyre", "degradation", "cliff", "compound",
      "neumático", "neumatico", "neumáticos", "neumaticos",
      "degradación", "degradacion", "compuesto"],                 ToolName.PREDICT_TIRE),
    (["pit", "stop", "undercut", "overcut", "box box",
      "parada", "boxes", "entra a boxes"],                        ToolName.PREDICT_PIT),
    (["overtake", "pass", "drs", "safety car", "sc prob",
      "adelantamiento", "adelantar",
      "coche de seguridad", "sc"],                                ToolName.PREDICT_SITUATION),
    (["pace", "lap time", "laptime", "fast", "slow",
      "ritmo", "tiempo de vuelta", "rápido", "rapido", "lento"], ToolName.PREDICT_PACE),
    (["radio", "message", "team radio",
      "mensaje", "radio del equipo"],                             ToolName.ANALYZE_RADIO),
    (["gps", "races", "calendar", "events",
      "carreras", "calendario", "eventos"],                       ToolName.LIST_GPS),
    (["drivers", "who raced", "driver list",
      "pilotos", "quiénes corrieron", "quienes corrieron",
      "lista de pilotos"],                                        ToolName.LIST_DRIVERS),
]

# Structured prompt sent to LM Studio for JSON extraction
_EXTRACTION_PROMPT = """\
You are a parameter extractor for an F1 strategy tool system.
Given the user message below, determine which tool to call and extract the parameters.

Phase 1 — strategy tools (need gp + driver + lap):
- predict_pace: lap time prediction
- predict_tire: tyre degradation analysis
- predict_situation: overtake + safety car probability
- predict_pit: pit stop strategy recommendation
- analyze_radio: team radio NLP analysis
- recommend_strategy: full strategy analysis
- query_regulations: FIA rule lookup (needs question, no gp/driver/lap)

Phase 2 — telemetry tools (need gp + drivers, lap optional):
- get_lap_times: lap-time chart for one or more drivers (driver + optional driver2)
- get_telemetry: speed/throttle/brake vs distance for a single driver on a specific lap (needs gp, driver, lap)
- compare_drivers: head-to-head telemetry overlay (needs gp, driver, driver2)
- get_race_data: full race overview — positions and lap times for a GP (needs gp, driver optional)

Helpers (no lap):
- list_gps: list available Grand Prix (optional year)
- list_drivers: list drivers for a GP (needs gp)

Driver codes are 3 letters (VER, HAM, NOR, LEC, PIA, RUS, ALO, ...).  Map
surnames to codes: Verstappen→VER, Hamilton→HAM, Norris→NOR, Leclerc→LEC,
Piastri→PIA, Russell→RUS, Alonso→ALO, Sainz→SAI, Perez→PER.

GP names — use the English form (Bahrain, Jeddah, Monaco, Silverstone,
Monza, Spa, Zandvoort, Austin, Abu Dhabi, ...).  Translate Spanish /
Italian / French spellings: Bahréin→Bahrain, Bélgica→Spa, Países Bajos→Zandvoort,
Italia→Monza, Gran Bretaña→Silverstone, Hungría→Budapest, Azerbaiyán→Baku.

Return ONLY valid JSON with no additional text:
{{"tool": "<tool_name>", "params": {{"gp": "...", "driver": "...", "driver2": "...", "lap": N, "year": N, "question": "..."}}}}

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
        driver2 = self._normalize_driver(params_raw.get("driver2"))
        lap = _safe_int(params_raw.get("lap"))

        params = ToolCallParams(
            gp=gp,
            driver=driver,
            driver2=driver2,
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
        """Find all driver codes in the message, supporting surnames.

        Matches explicit 3-letter codes (VER, HAM, ...) and also common
        surnames in any language ("Verstappen", "Hamilton", "Leclerc").
        Order is preserved and duplicates are removed so downstream logic
        can reliably pick the first and second mentioned driver.
        """
        lower_msg = upper_msg.lower()
        hits: list[tuple[int, str]] = []
        seen: set[str] = set()

        for match in re.finditer(r"\b[A-Z]{3}\b", upper_msg):
            code = match.group()
            if code in _DRIVER_CODES and code not in seen:
                hits.append((match.start(), code))
                seen.add(code)

        for surname, code in _DRIVER_SURNAMES.items():
            if code in seen:
                continue
            idx = lower_msg.find(surname)
            if idx >= 0:
                hits.append((idx, code))
                seen.add(code)

        hits.sort(key=lambda t: t[0])
        return [code for _, code in hits]

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
        """Keyword-based GP detection when no GP list is available.

        Keys cover English, Spanish, Italian, French and other common
        spellings — the chat often arrives in mixed language ("Bahrein
        2025", "Países Bajos", "Japón").  Values must match the GP_Name
        column in the featured parquet (circuit/city names).
        """
        gp_keywords = {
            # Bahrain
            "bahrain": "Sakhir", "sakhir": "Sakhir",
            "bahrein": "Sakhir", "baréin": "Sakhir", "baréin": "Sakhir",
            # Saudi Arabia
            "jeddah": "Jeddah", "saudi": "Jeddah",
            "arabia": "Jeddah", "yeda": "Jeddah",
            # Australia
            "australia": "Melbourne", "melbourne": "Melbourne",
            # Japan
            "japan": "Suzuka", "japón": "Suzuka", "japon": "Suzuka",
            "suzuka": "Suzuka",
            # China
            "china": "Shanghai", "shanghai": "Shanghai",
            # Miami
            "miami": "Miami",
            # Imola
            "imola": "Imola", "emilia": "Imola",
            # Monaco
            "monaco": "Monaco", "mónaco": "Monaco",
            # Canada
            "canada": "Montréal", "canadá": "Montréal",
            "montreal": "Montréal", "montréal": "Montréal",
            # Spain
            "spain": "Barcelona", "españa": "Barcelona", "espana": "Barcelona",
            "barcelona": "Barcelona", "cataluña": "Barcelona",
            # Austria
            "austria": "Spielberg", "spielberg": "Spielberg",
            "red bull ring": "Spielberg",
            # Britain
            "britain": "Silverstone", "gran bretaña": "Silverstone",
            "uk": "Silverstone", "reino unido": "Silverstone",
            "silverstone": "Silverstone",
            # Hungary
            "hungary": "Budapest", "hungría": "Budapest", "hungria": "Budapest",
            "budapest": "Budapest",
            # Belgium
            "belgium": "Spa-Francorchamps", "bélgica": "Spa-Francorchamps",
            "belgica": "Spa-Francorchamps", "spa": "Spa-Francorchamps",
            # Netherlands
            "netherlands": "Zandvoort", "países bajos": "Zandvoort",
            "paises bajos": "Zandvoort", "holanda": "Zandvoort",
            "zandvoort": "Zandvoort",
            # Italy
            "italy": "Monza", "italia": "Monza", "monza": "Monza",
            # Azerbaijan
            "azerbaijan": "Baku", "azerbaiyán": "Baku", "azerbaiyan": "Baku",
            "baku": "Baku", "bakú": "Baku",
            # Singapore
            "singapore": "Marina Bay", "singapur": "Marina Bay",
            "marina bay": "Marina Bay",
            # United States
            "united states": "Austin", "austin": "Austin",
            "cota": "Austin", "estados unidos": "Austin", "usa": "Austin",
            # Mexico
            "mexico": "Mexico City", "méxico": "Mexico City",
            "mexico city": "Mexico City",
            # Brazil
            "brazil": "São Paulo", "brasil": "São Paulo",
            "interlagos": "São Paulo",
            "sao paulo": "São Paulo", "são paulo": "São Paulo",
            # Las Vegas
            "las vegas": "Las Vegas", "vegas": "Las Vegas",
            # Qatar
            "qatar": "Lusail", "lusail": "Lusail", "catar": "Lusail",
            # Abu Dhabi
            "abu dhabi": "Yas Island", "yas marina": "Yas Island",
            "yas island": "Yas Island",
        }
        lower = message.lower()
        # Longer keywords first — "red bull ring" must win over "ring" fragments.
        for keyword in sorted(gp_keywords, key=len, reverse=True):
            if keyword in lower:
                return gp_keywords[keyword]
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
        """Normalize a driver string to a 3-letter code.

        Accepts either a valid 3-letter code ("VER"), a full surname
        ("Verstappen" → "VER") or anything whose first three letters
        happen to match a known code.  Surname lookup covers the case
        where the LLM emits the full name instead of the code.
        """
        if not driver_raw:
            return None
        upper = driver_raw.upper().strip()
        if upper in _DRIVER_CODES:
            return upper

        surname_code = _DRIVER_SURNAMES.get(driver_raw.lower().strip())
        if surname_code:
            return surname_code

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
