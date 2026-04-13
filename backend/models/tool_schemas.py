"""
Tool Schemas — Pydantic v2 models for MCP tool calling in the chat pipeline.

Defines the data contracts for:
- Tool call extraction (what tool + what params the user is asking for)
- Tool result data (structured output from an agent, ready for frontend rendering)
- Tool-aware chat response (extends ChatResponse with optional tool_result)
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ToolName(str, Enum):
    """Available MCP tools that map 1:1 to strategy agent endpoints."""

    PREDICT_PACE = "predict_pace"
    PREDICT_TIRE = "predict_tire"
    PREDICT_SITUATION = "predict_situation"
    PREDICT_PIT = "predict_pit"
    ANALYZE_RADIO = "analyze_radio"
    QUERY_REGULATIONS = "query_regulations"
    RECOMMEND_STRATEGY = "recommend_strategy"
    LIST_GPS = "list_gps"
    LIST_DRIVERS = "list_drivers"
    GET_LAP_RANGE = "get_lap_range"

    # Phase 2 — Telemetry & comparison tools
    GET_LAP_TIMES = "get_lap_times"
    GET_TELEMETRY = "get_telemetry"
    COMPARE_DRIVERS = "compare_drivers"
    GET_RACE_DATA = "get_race_data"


class DisplayType(str, Enum):
    """How the frontend should render a tool result inside a chat bubble."""

    METRICS = "metrics"
    STRATEGY_CARD = "strategy_card"
    TABLE = "table"
    CHART = "chart"
    TEXT = "text"


# Map each tool to its default rendering style.
TOOL_DISPLAY_MAP: dict[ToolName, DisplayType] = {
    ToolName.PREDICT_PACE: DisplayType.METRICS,
    ToolName.PREDICT_TIRE: DisplayType.STRATEGY_CARD,
    ToolName.PREDICT_SITUATION: DisplayType.METRICS,
    ToolName.PREDICT_PIT: DisplayType.STRATEGY_CARD,
    ToolName.ANALYZE_RADIO: DisplayType.TABLE,
    ToolName.QUERY_REGULATIONS: DisplayType.TEXT,
    ToolName.RECOMMEND_STRATEGY: DisplayType.STRATEGY_CARD,
    ToolName.LIST_GPS: DisplayType.TEXT,
    ToolName.LIST_DRIVERS: DisplayType.TEXT,
    ToolName.GET_LAP_RANGE: DisplayType.TEXT,
    # Phase 2
    ToolName.GET_LAP_TIMES: DisplayType.TABLE,
    ToolName.GET_TELEMETRY: DisplayType.TABLE,
    ToolName.COMPARE_DRIVERS: DisplayType.TABLE,
    ToolName.GET_RACE_DATA: DisplayType.TABLE,
}


# ---------------------------------------------------------------------------
# Tool call extraction (backend internal)
# ---------------------------------------------------------------------------

class ToolCallParams(BaseModel):
    """Parameters extracted from the user message for a tool invocation."""

    model_config = ConfigDict(str_strip_whitespace=True)

    gp: Optional[str] = Field(None, description="Grand Prix name (e.g. 'Bahrain', 'Jeddah').")
    driver: Optional[str] = Field(None, description="3-letter driver code (e.g. 'VER', 'HAM').")
    driver2: Optional[str] = Field(None, description="Second driver code for comparison tools.")
    lap: Optional[int] = Field(None, ge=1, description="Lap number to analyse.")
    year: int = Field(2025, ge=2023, le=2025, description="Season year.")
    risk_tolerance: float = Field(0.5, ge=0.0, le=1.0, description="Risk tolerance for the orchestrator.")
    question: Optional[str] = Field(None, description="Free-text question for RAG / regulations lookup.")


class ToolCall(BaseModel):
    """Result of the parameter extraction step — which tool to invoke and with what."""

    model_config = ConfigDict(str_strip_whitespace=True)

    tool: ToolName
    params: ToolCallParams
    confidence: float = Field(
        0.0, ge=0.0, le=1.0,
        description="How confident the extractor is that it parsed the right tool + params.",
    )

    @property
    def has_required_location(self) -> bool:
        """True when the minimum params for a lap-state-based tool are present."""
        return all([self.params.gp, self.params.driver, self.params.lap])

    @property
    def is_rag_query(self) -> bool:
        """True when the tool only needs a free-text question (no lap state)."""
        return self.tool == ToolName.QUERY_REGULATIONS

    @property
    def is_listing_tool(self) -> bool:
        """True for helper tools that list GPs / drivers / lap ranges."""
        return self.tool in {ToolName.LIST_GPS, ToolName.LIST_DRIVERS, ToolName.GET_LAP_RANGE}

    @property
    def is_telemetry_tool(self) -> bool:
        """True for Phase 2 telemetry tools that may not need a lap number."""
        return self.tool in {
            ToolName.GET_LAP_TIMES, ToolName.GET_RACE_DATA,
            ToolName.COMPARE_DRIVERS, ToolName.GET_TELEMETRY,
        }


# ---------------------------------------------------------------------------
# Tool result (backend → frontend)
# ---------------------------------------------------------------------------

class ToolResultData(BaseModel):
    """Structured output attached to a chat response when a tool was invoked.

    The frontend inspects *display_type* to decide how to render *data*:
    - metrics → st.metric columns
    - strategy_card → bordered container with action / confidence / compound
    - table → st.dataframe
    - chart → st.plotly_chart (data contains figure JSON or base64 image)
    - text → st.markdown
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    tool_name: str = Field(..., description="Which tool produced this result.")
    display_type: DisplayType = Field(..., description="Rendering hint for the frontend.")
    data: dict[str, Any] = Field(default_factory=dict, description="Agent output payload.")
    summary: str = Field("", description="Natural-language summary produced by LM Studio.")


# ---------------------------------------------------------------------------
# Extended chat response
# ---------------------------------------------------------------------------

class ToolMessageRequest(BaseModel):
    """Request body for POST /api/v1/chat/tool-message.

    Identical to ChatRequest but explicitly typed so FastAPI generates
    a separate OpenAPI schema (easier to version independently).
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(..., min_length=1, description="User message.")
    image: Optional[str] = Field(None, description="Base64-encoded image for multimodal models.")
    chat_history: Optional[list[dict[str, Any]]] = Field(None, description="Prior messages for context.")
    context: Optional[dict[str, Any]] = Field(None, description="Arbitrary context (e.g. current GP/driver).")
    model: Optional[str] = Field(None, description="Override LM Studio model.")
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(1000, ge=1, le=8192)


class ToolMessageResponse(BaseModel):
    """Response for the tool-aware chat endpoint.

    Always contains a human-readable *response*.  When a tool was invoked
    successfully, *tool_result* carries the structured data for rich rendering.
    """

    response: str = Field(..., description="Natural-language assistant reply.")
    llm_model: Optional[str] = None
    tokens_used: Optional[int] = None
    tool_result: Optional[ToolResultData] = Field(
        None,
        description="Present only when a strategy tool was invoked and returned data.",
    )
