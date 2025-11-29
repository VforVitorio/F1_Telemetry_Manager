# Chat Implementation Plan - F1 Telemetry Manager

## Overview
Implementation of an AI-powered chat assistant ("Caronte") using LM Studio for local LLM inference. The chat will support text and multimodal interactions (images), maintain conversation history, and provide F1-specific insights.

### Key Features in This Implementation

**Core Chat Functionality:**
- ✅ Text and image message support (multimodal)
- ✅ Streaming responses for better UX
- ✅ Chat history management (save, load, delete)
- ✅ Model and parameter selection (temperature, etc.)
- ✅ LM Studio integration with local inference

**Advanced Features:**
- 🎯 **Query Routing System**: Intelligent classification and context matching
- 🤖 **"Ask About This" Integration**: Send charts directly from dashboard/comparison pages with predefined prompts
- 📊 **Context-Aware Responses**: Inject F1 session context into system prompts
- 🎨 **Predefined Prompt Templates**: Chart-specific prompts for different visualization types
- 🔄 **Cross-Page Navigation**: Seamless workflow from analysis to chat

---

## Architecture Overview

### Frontend (Streamlit)
- **Components**: Reusable chat UI components
- **Pages**: Enhanced chat page with full functionality
- **Services**: API communication layer for chat operations
- **State Management**: Streamlit session state for conversation history
- **Cross-page Integration**: "Ask about this" buttons from dashboard/comparison pages

### Backend (FastAPI)
- **Endpoints**: RESTful API for chat operations
- **Services**: LM Studio integration and message processing
- **Models**: Pydantic models for request/response validation
- **Query Router**: Intelligent query classification and routing system

### LM Studio Integration
- **API**: LM Studio local server (compatible with OpenAI API format)
- **Models**: Vision-capable models (e.g., llava, bakllava, llama3.2-vision)
- **Connection**: HTTP requests to `http://localhost:1234/v1/chat/completions`

### Query Routing System
- **Classification**: Determine query type (general F1, telemetry analysis, strategy, technical)
- **Context Matching**: Match query with available telemetry data
- **Response Strategy**: Route to appropriate response handler based on classification

---

## File Structure

### Backend Files

#### **Files to CREATE**

1. **`backend/models/chat_models.py`**
   - Pydantic models for chat requests/responses
   ```python
   - ChatMessage
   - ChatRequest
   - ChatResponse
   - ChatHistoryResponse
   - AvailableModelsResponse
   - ChatContext (for F1 telemetry context)
   ```

2. **`backend/services/chatbot/lm_studio_service.py`**
   - LM Studio API client
   - Message formatting and API calls
   - Streaming response handling
   - Model availability checking
   ```python
   - get_available_models() -> List[str]
   - send_message(messages, model, temperature) -> ChatResponse
   - stream_message(messages, model, temperature) -> Generator
   ```

3. **`backend/services/chatbot/chat_service.py`**
   - Business logic for chat operations
   - Context injection (current telemetry data, session info)
   - System prompt management
   - Message history formatting
   ```python
   - build_system_prompt(context: Optional[ChatContext]) -> str
   - format_messages_for_llm(history: List[ChatMessage]) -> List[dict]
   - process_user_message(text, image, context) -> ChatResponse
   ```

4. **`backend/services/chatbot/query_router.py`**
   - Query classification and routing system
   - Determine query type and appropriate response strategy
   ```python
   - classify_query(query: str) -> QueryType
   - route_query(query: str, context: ChatContext) -> ResponseStrategy
   - match_context_to_query(query: str, available_data: dict) -> ContextMatch
   ```

5. **`backend/services/chatbot/prompt_templates.py`**
   - Predefined prompt templates for different scenarios
   - Default prompts for "Ask about this" buttons
   ```python
   - TELEMETRY_ANALYSIS_TEMPLATE = "Analyze this telemetry chart showing..."
   - COMPARISON_TEMPLATE = "Compare these two drivers' performance..."
   - STRATEGY_TEMPLATE = "Explain the strategy shown in this data..."
   - SECTOR_ANALYSIS_TEMPLATE = "Analyze the sector times in this chart..."
   ```

6. **`backend/api/v1/endpoints/chat.py`**
   - FastAPI route handlers
   ```python
   - POST /api/v1/chat/message - Send message and get response
   - POST /api/v1/chat/stream - Send message and stream response
   - POST /api/v1/chat/ask-about - Open chat with predefined prompt + image
   - GET /api/v1/chat/models - Get available LM Studio models
   - GET /api/v1/chat/health - Check LM Studio connection
   ```

7. **`backend/core/lm_studio_config.py`**
   - Configuration for LM Studio connection
   ```python
   - LM_STUDIO_BASE_URL = "http://localhost:1234/v1"
   - DEFAULT_MODEL = "llama3.2-vision"
   - DEFAULT_TEMPERATURE = 0.2
   - MAX_TOKENS = 2048
   - TIMEOUT = 120
   ```

#### **Files to MODIFY**

1. **`backend/main.py`**
   - Import and include chat router
   ```python
   from api.v1.endpoints import chat
   app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
   ```

2. **`backend/requirements.txt`**
   - Add dependencies (if not already present)
   ```
   openai>=1.0.0  # For LM Studio API compatibility
   aiohttp>=3.9.0  # For async HTTP requests
   ```

---

### Frontend Files

#### **Files to CREATE**

1. **`frontend/components/chatbot/chat_message.py`**
   - Individual message component (user/assistant)
   - Message bubble with role-specific styling
   - Image display support
   - Markdown rendering
   ```python
   def render_chat_message(role: str, msg_type: str, content: Any):
       # Render user or assistant message with appropriate styling
   ```

2. **`frontend/components/chatbot/chat_input.py`**
   - Message input area component
   - Text area + image uploader
   - Send button with loading state
   - Input validation
   ```python
   def render_chat_input() -> Tuple[str, Optional[bytes], bool]:
       # Returns (text, image_bytes, send_clicked)
   ```

3. **`frontend/components/chatbot/chat_history.py`**
   - Chat history display container
   - Scrollable message list
   - Auto-scroll to bottom on new messages
   - Empty state when no messages
   ```python
   def render_chat_history(messages: List[dict]):
       # Render all messages in conversation
   ```

4. **`frontend/components/chatbot/chat_sidebar.py`**
   - Sidebar with chat management
   - New chat button
   - Chat history list (saved chats)
   - Delete chat button
   - Model parameters (model selector, temperature slider)
   ```python
   def render_chat_sidebar() -> Tuple[str, float]:
       # Returns (selected_model, temperature)
   ```

5. **`frontend/components/chatbot/chat_context_panel.py`**
   - Display current F1 context (optional)
   - Show selected race, session, drivers
   - "Send context to chat" button
   ```python
   def render_context_panel():
       # Display current telemetry context
   ```

6. **`frontend/services/chat_service.py`**
   - API communication for chat operations
   ```python
   - send_message(text: str, image: bytes, model: str, temperature: float) -> dict
   - stream_message(...) -> Generator
   - get_available_models() -> List[str]
   - check_lm_studio_health() -> bool
   ```

7. **`frontend/utils/chat_state.py`**
   - Chat state management utilities
   - Initialize session state
   - Chat CRUD operations (create, load, delete)
   - Chat name generation
   ```python
   - initialize_chat_state()
   - create_new_chat(context: Optional[dict])
   - load_chat(chat_name: str)
   - delete_chat(chat_name: str)
   - save_current_chat()
   - generate_chat_name(first_message: str) -> str
   ```

8. **`frontend/utils/chat_navigation.py`**
   - Cross-page navigation utilities
   - Open chat with predefined content
   ```python
   - open_chat_with_image(image: bytes, prompt: str, chart_type: str)
   - navigate_to_chat_with_context(context: dict)
   - create_ask_about_button(image: bytes, prompt_template: str, label: str)
   ```

9. **`frontend/components/common/ask_about_button.py`**
   - Reusable "Ask about this" button component
   - Captures chart/graph as image and navigates to chat
   ```python
   def render_ask_about_button(
       chart_fig: plotly.graph_objs.Figure,
       prompt_template: str,
       button_label: str = "🤖 Ask AI about this"
   ):
       # Convert plotly figure to image
       # Create button with callback to open chat
       # Navigate to chat page with image and prompt
   ```

#### **Files to MODIFY**

1. **`frontend/pages/chat.py`**
   - Replace placeholder with full chat implementation
   - Integrate all chat components
   - Handle streaming responses
   - Manage chat state
   ```python
   def render_chat_page():
       initialize_chat_state()

       # Sidebar
       with st.sidebar:
           model, temperature = render_chat_sidebar()

       # Main content
       st.markdown("## F1 Strategy Assistant Chat")
       render_context_panel()  # Optional

       # Chat history container
       chat_container = st.container()
       with chat_container:
           render_chat_history(st.session_state.chat_history)

       # Input container
       input_container = st.container()
       with input_container:
           text, image, send_clicked = render_chat_input()
           if send_clicked:
               handle_send_message(text, image, model, temperature)
   ```

2. **`frontend/requirements.txt`**
   - No additional dependencies needed (already have `httpx`, `requests`)

---

## Session State Structure

### Chat Session State Keys

```python
# Chat history for current conversation
st.session_state['chat_history'] = [
    {
        "role": "user" | "assistant",
        "type": "text" | "image",
        "content": str | bytes,
        "timestamp": datetime
    },
    ...
]

# Saved chats (multiple conversations)
st.session_state['chat_saved_chats'] = {
    "Chat about VER vs HAM": [...messages...],
    "Spanish GP Analysis": [...messages...],
    ...
}

# Current chat name (None if unsaved)
st.session_state['chat_current_name'] = str | None

# System prompt (built from F1 context)
st.session_state['chat_system_prompt'] = str

# F1 context (optional - from dashboard/comparison pages)
st.session_state['chat_f1_context'] = {
    "year": int,
    "gp": str,
    "session": str,
    "drivers": List[str],
    "telemetry_snapshot": dict  # Optional
}

# UI state
st.session_state['chat_input_key'] = int  # For clearing input after send
st.session_state['chat_streaming'] = bool  # True when receiving response
```

---

## API Endpoints Specification

### 1. Send Message (Non-streaming)

**Endpoint:** `POST /api/v1/chat/message`

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": "text content"
    }
  ],
  "model": "llama3.2-vision",
  "temperature": 0.2,
  "max_tokens": 2048,
  "image": "base64_encoded_image_string" | null,
  "context": {
    "year": 2024,
    "gp": "Spanish Grand Prix",
    "session": "Q",
    "drivers": ["VER", "HAM"]
  } | null
}
```

**Response:**
```json
{
  "role": "assistant",
  "content": "AI response text",
  "model": "llama3.2-vision",
  "tokens_used": 150
}
```

### 2. Stream Message (Streaming)

**Endpoint:** `POST /api/v1/chat/stream`

**Request Body:** Same as `/message`

**Response:** Server-Sent Events (SSE) stream
```
data: {"chunk": "First", "done": false}
data: {"chunk": " part", "done": false}
data: {"chunk": " of response", "done": true}
```

### 3. Get Available Models

**Endpoint:** `GET /api/v1/chat/models`

**Response:**
```json
{
  "models": [
    "llama3.2-vision",
    "bakllava",
    "llava-v1.6-mistral-7b"
  ]
}
```

### 4. Health Check

**Endpoint:** `GET /api/v1/chat/health`

**Response:**
```json
{
  "status": "healthy" | "unhealthy",
  "lm_studio_reachable": true | false,
  "models_available": 3
}
```

### 5. Ask About (Predefined Prompt + Image)

**Endpoint:** `POST /api/v1/chat/ask-about`

**Request Body:**
```json
{
  "chart_type": "speed_graph" | "comparison" | "delta" | "sector_times",
  "image": "base64_encoded_image_string",
  "prompt_template_key": "telemetry_analysis" | "comparison" | "strategy",
  "context": {
    "year": 2024,
    "gp": "Spanish Grand Prix",
    "session": "Q",
    "drivers": ["VER", "HAM"],
    "additional_info": {
      "lap_number": 15,
      "compound": "Soft",
      "delta": "+0.234s"
    }
  }
}
```

**Response:**
```json
{
  "chat_initialized": true,
  "initial_prompt": "Analyze this speed graph showing Max Verstappen's lap 15...",
  "chat_name": "Speed Analysis - VER Lap 15"
}
```

---

## Query Routing System

### Overview
The query router intelligently classifies user questions and routes them to appropriate response strategies, ensuring contextually relevant and accurate answers.

### Query Classification Types

```python
class QueryType(Enum):
    GENERAL_F1 = "general_f1"              # General F1 knowledge questions
    TELEMETRY_ANALYSIS = "telemetry"       # Specific telemetry data analysis
    DRIVER_COMPARISON = "comparison"       # Driver vs driver comparisons
    STRATEGY_QUESTION = "strategy"         # Race strategy questions
    TECHNICAL_QUESTION = "technical"       # Technical/engineering questions
    LAP_TIME_ANALYSIS = "lap_times"        # Lap time specific questions
    SECTOR_ANALYSIS = "sectors"            # Sector/microsector questions
    HISTORICAL_DATA = "historical"         # Historical race data
    CURRENT_SESSION = "current_session"    # Questions about loaded session
```

### Routing Flow

```
User Query
    ↓
┌─────────────────────────┐
│ Query Classifier        │
│ - Analyze query text    │
│ - Identify key entities │
│ - Extract intent        │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Context Matcher         │
│ - Check available data  │
│ - Match to query needs  │
└─────────────────────────┘
    ↓
  Match?
    ├─ YES ──→ ┌──────────────────────────┐
    │          │ Enhanced Response        │
    │          │ - Use specific data      │
    │          │ - Detailed analysis      │
    │          │ - Data-driven insights   │
    │          └──────────────────────────┘
    │
    └─ NO ───→ ┌──────────────────────────┐
               │ General Response         │
               │ - Use general knowledge  │
               │ - Offer to load data     │
               │ - Suggest relevant info  │
               └──────────────────────────┘
```

### Classification Logic

**Example 1: Telemetry Analysis**
```
Query: "Why is Verstappen faster in sector 2?"

Classification:
- Type: SECTOR_ANALYSIS
- Entities: ["Verstappen", "sector 2"]
- Intent: Compare sector performance

Context Check:
- Loaded session? YES → Spanish GP 2024, Q
- Verstappen data available? YES
- Other drivers for comparison? YES (HAM)

Route:
→ Enhanced Response with sector telemetry data
→ Include speed, throttle, brake data for sector 2
→ Compare with Hamilton's sector 2
→ Highlight differences
```

**Example 2: General F1 Question**
```
Query: "Who won the 2023 championship?"

Classification:
- Type: HISTORICAL_DATA
- Entities: ["2023", "championship"]
- Intent: Factual question

Context Check:
- Requires specific telemetry? NO
- Can answer from general knowledge? YES

Route:
→ General Response
→ Answer from LLM general knowledge
→ No need for telemetry data
```

**Example 3: Current Session Question**
```
Query: "Show me the fastest lap"

Classification:
- Type: CURRENT_SESSION
- Entities: ["fastest lap"]
- Intent: Data retrieval

Context Check:
- Loaded session? YES → Spanish GP 2024, Q
- Available laps? YES

Route:
→ Enhanced Response with data
→ Retrieve fastest lap for all drivers
→ Display lap times table
→ Offer to show telemetry for fastest lap
```

### Response Strategies

#### Strategy 1: Direct Answer (General Knowledge)
- No telemetry data needed
- Answer from LLM training
- Quick response

#### Strategy 2: Data-Enhanced Answer
- Use loaded telemetry data
- Generate insights from data
- Include specific numbers and comparisons
- May generate mini-charts or tables

#### Strategy 3: Interactive Response
- Prompt user to load specific data
- Offer suggestions for analysis
- Provide next steps

#### Strategy 4: Multimodal Analysis
- Analyze provided image
- Cross-reference with telemetry data (if available)
- Detailed visual analysis

---

## "Ask About This" Integration

### Overview
Allows users to send charts, graphs, or visualizations directly from Dashboard/Comparison pages to the chat with predefined context-aware prompts.

### User Flow

```
Dashboard/Comparison Page
    ↓
User viewing chart (e.g., Speed Graph)
    ↓
Clicks "🤖 Ask AI about this" button
    ↓
┌──────────────────────────────────┐
│ 1. Capture chart as image        │
│    - Plotly to base64            │
│    - Include current view state  │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ 2. Build context object          │
│    - Year, GP, Session           │
│    - Drivers shown in chart      │
│    - Chart type                  │
│    - Additional metadata         │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ 3. Select prompt template        │
│    - Based on chart type         │
│    - Inject context variables    │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ 4. Navigate to chat page         │
│    - Set session state           │
│    - Create new chat or append   │
└──────────────────────────────────┘
    ↓
┌──────────────────────────────────┐
│ 5. Auto-send message             │
│    - Image attached              │
│    - Predefined prompt sent      │
│    - AI response streams         │
└──────────────────────────────────┘
```

### Prompt Templates by Chart Type

#### Speed Graph
```python
SPEED_GRAPH_PROMPT = """Analyze this speed graph showing {driver_name}'s performance during {session_type} at the {gp_name} ({year}).

Key details:
- Driver: {driver_name} ({team_name})
- Lap: {lap_number}
- Compound: {tyre_compound}
{comparison_info}

Please analyze:
1. Speed patterns throughout the lap
2. Key braking zones and acceleration points
3. Potential areas for improvement
4. Comparison with {comparison_driver} (if applicable)
"""
```

#### Comparison Graph
```python
COMPARISON_PROMPT = """Compare the performance of {driver1_name} and {driver2_name} in this telemetry comparison from {session_type} at {gp_name} ({year}).

Drivers:
- {driver1_name}: {driver1_team} - {driver1_lap_time}
- {driver2_name}: {driver2_team} - {driver2_lap_time}
- Delta: {time_delta}

Please analyze:
1. Where each driver gains/loses time
2. Different driving styles or approaches
3. Technical or strategic differences
4. Recommendations for the slower driver
"""
```

#### Delta Graph
```python
DELTA_GRAPH_PROMPT = """Analyze the delta time graph between {driver1_name} and {driver2_name} at {gp_name} ({year}).

The graph shows the time difference throughout the lap, with positive values indicating {driver1_name} is ahead.

Please explain:
1. Which sections each driver dominates
2. The cumulative effect throughout the lap
3. Critical moments where the gap changes significantly
4. Strategic implications of these differences
"""
```

#### Sector Analysis
```python
SECTOR_ANALYSIS_PROMPT = """Analyze the sector performance shown in this chart from {session_type} at {gp_name} ({year}).

{sector_times_table}

Please provide:
1. Fastest driver in each sector and why
2. Consistent vs. inconsistent performers
3. Potential setup or strategy differences
4. Overall lap construction analysis
"""
```

### Button Placement

**Dashboard Page:**
- Below each telemetry graph (Speed, Brake, Throttle, etc.)
- Below circuit domination visualization
- Label: "🤖 Ask AI about this graph"

**Comparison Page:**
- Below synchronized comparison animation
- Below delta graph
- Below circuit visualization
- Label: "🤖 Ask AI about this comparison"

### Session State for Navigation

```python
# When "Ask about this" is clicked
st.session_state['chat_pending_message'] = {
    'image': base64_image,
    'prompt': formatted_prompt,
    'context': context_dict,
    'chart_type': 'speed_graph',
    'auto_send': True
}

# Navigate to chat page
st.session_state['current_page'] = 'chat'
st.rerun()

# On chat page load, check for pending message
if 'chat_pending_message' in st.session_state:
    pending = st.session_state.pop('chat_pending_message')

    # Create new chat or append to existing
    if pending['auto_send']:
        # Add image and prompt to chat
        add_message("user", "image", pending['image'])
        add_message("user", "text", pending['prompt'])

        # Send to AI immediately
        handle_user_input(
            text=pending['prompt'],
            image=pending['image'],
            context=pending['context']
        )
```

### Chart to Image Conversion

```python
import plotly.graph_objects as go
import base64
from io import BytesIO

def plotly_fig_to_base64(fig: go.Figure, format: str = "png") -> str:
    """
    Convert a Plotly figure to base64 encoded image.

    Args:
        fig: Plotly figure object
        format: Image format (png, jpg, svg)

    Returns:
        Base64 encoded string
    """
    img_bytes = fig.to_image(format=format, width=1200, height=600)
    img_b64 = base64.b64encode(img_bytes).decode('utf-8')
    return img_b64
```

### Context Injection Example

```python
def build_ask_about_context(
    chart_type: str,
    year: int,
    gp: str,
    session: str,
    drivers: List[str],
    **kwargs
) -> dict:
    """
    Build context object for "Ask about this" functionality.
    """
    context = {
        "chart_type": chart_type,
        "year": year,
        "gp": gp,
        "session": session,
        "drivers": drivers,
        "timestamp": datetime.now().isoformat(),
    }

    # Add chart-specific context
    if chart_type == "speed_graph":
        context.update({
            "lap_number": kwargs.get("lap_number"),
            "compound": kwargs.get("compound"),
            "lap_time": kwargs.get("lap_time"),
        })
    elif chart_type == "comparison":
        context.update({
            "driver1_time": kwargs.get("driver1_time"),
            "driver2_time": kwargs.get("driver2_time"),
            "delta": kwargs.get("delta"),
        })

    return context
```

---

## Implementation Flow

### Message Send Flow (Streaming)

```
1. User types message and/or uploads image
   ↓
2. Frontend: Validate input (not empty)
   ↓
3. Frontend: Add user message to chat_history
   ↓
4. Frontend: Display user message in chat
   ↓
5. Frontend: Show "Assistant is typing..." indicator
   ↓
6. Frontend: Build request payload
   - Format all chat_history messages
   - Add system prompt with F1 context
   - Encode image as base64 if present
   ↓
7. Frontend: POST to /api/v1/chat/stream
   ↓
8. Backend: Receive request
   ↓
9. Backend: Build LM Studio API request
   - Add system prompt (F1 assistant role + context)
   - Format messages for OpenAI-compatible API
   - Include image in multimodal format if present
   ↓
10. Backend: POST to LM Studio API (http://localhost:1234/v1/chat/completions)
    - Set stream=True for streaming response
    ↓
11. Backend: Stream response chunks back to frontend (SSE)
    ↓
12. Frontend: Display chunks in real-time
    - Accumulate text in temporary container
    - Update display with each chunk
    ↓
13. Frontend: When stream complete
    - Add full assistant response to chat_history
    - Clear temporary container
    - Re-enable input field
    - Auto-save chat if named
```

### Chat Management Flow

**Create New Chat:**
```
1. User clicks "New Chat" button
   ↓
2. If current chat has messages and no name:
   - Generate name from first user message (first 30 chars)
   - Save to chat_saved_chats
   ↓
3. Clear chat_history
   ↓
4. Set chat_current_name = None
   ↓
5. Rerun page
```

**Load Saved Chat:**
```
1. User clicks saved chat name in sidebar
   ↓
2. If current chat has unsaved changes:
   - Auto-save with generated name
   ↓
3. Load selected chat from chat_saved_chats
   ↓
4. Set chat_current_name = selected_name
   ↓
5. Rerun page
```

**Delete Chat:**
```
1. User clicks "Delete current chat"
   ↓
2. If chat has name:
   - Remove from chat_saved_chats
   ↓
3. Clear chat_history
   ↓
4. Set chat_current_name = None
   ↓
5. Rerun page
```

---

## System Prompt Template

```python
SYSTEM_PROMPT_TEMPLATE = """You are Caronte, an advanced Formula 1 strategy assistant integrated into the F1 Telemetry Manager.

**Your Role:**
- Provide expert analysis on F1 telemetry data, race strategy, and technical aspects
- Answer questions strictly related to Formula 1 (history, races, drivers, teams, regulations, technical details)
- Analyze visual data: lap time charts, tyre degradation graphs, pit stop timelines, sector comparisons, etc.

**Your Capabilities:**
- Access to historical F1 data (race results, lap times, pit stops, weather, tyre choices, standings)
- Image analysis: When an image is provided, describe it in detail, extract insights, and answer specific questions
- Context awareness: You have access to the current race session context

**Current Context:**
{context_info}

**Guidelines:**
- Use technical F1 terminology appropriately
- Provide clear, concise, actionable responses
- If a question is not F1-related, politely refuse and remind user of your scope
- When analyzing images, relate findings to F1 strategy and performance
- Remember previous conversation context

**F1 2024 Grid Reference:**
You have access to driver names, numbers, and team affiliations. Always identify drivers by name and team in your explanations.
"""

# Context info example:
"""
- Year: 2024
- Grand Prix: Spanish Grand Prix
- Session: Qualifying
- Drivers being analyzed: VER (Max Verstappen, Red Bull Racing), HAM (Lewis Hamilton, Mercedes)
"""
```

---

## UI/UX Specifications

### Color Scheme (Matching Existing Theme)

```python
# Message bubbles
USER_MESSAGE_BG = "#23234a"  # Dark blue-purple (user)
ASSISTANT_MESSAGE_BG = "#393e46"  # Dark gray (assistant)
MESSAGE_TEXT_COLOR = "#ffffff"  # White text

# Sidebar
SIDEBAR_BG = "#121127"  # Primary background
SAVED_CHAT_ACTIVE = "#a78bfa"  # Purple accent (current chat)
SAVED_CHAT_HOVER = "#1e1b4b"  # Secondary background

# Input area
INPUT_BG = "#181633"  # Content background
INPUT_BORDER = "#a78bfa"  # Purple accent
SEND_BUTTON_BG = "#a78bfa"  # Purple accent
SEND_BUTTON_HOVER = "#8b5cf6"  # Darker purple

# Status indicators
TYPING_INDICATOR = "#a78bfa"  # Purple dots animation
ERROR_MESSAGE_BG = "#ef4444"  # Error red
WARNING_MESSAGE_BG = "#f59e0b"  # Warning orange
```

### Component Layout

```
┌─────────────────────────────────────────────────────┐
│ Navbar (existing)                                   │
├──────────┬──────────────────────────────────────────┤
│          │ ## F1 Strategy Assistant Chat            │
│ Sidebar  │                                          │
│          │ ┌────────────────────────────────────┐  │
│ New Chat │ │ Chat History Container             │  │
│          │ │ ┌────────────────────────────────┐ │  │
│ ───────  │ │ │ 🏎️ You: Why did VER pit on   │ │  │
│          │ │ │ lap 15?                        │ │  │
│ History: │ │ └────────────────────────────────┘ │  │
│ • Chat 1 │ │                                    │  │
│ • Chat 2 │ │ ┌────────────────────────────────┐ │  │
│          │ │ │ 🤖 Assistant: Verstappen's    │ │  │
│ ───────  │ │ │ pit stop on lap 15 was...     │ │  │
│          │ │ └────────────────────────────────┘ │  │
│ Delete   │ │ [Auto-scroll to bottom]            │  │
│          │ └────────────────────────────────────┘  │
│ ───────  │                                          │
│          │ ┌────────────────────────────────────┐  │
│ Model    │ │ Message Input                      │  │
│ ▼ llama  │ │ [Text area: "Ask me anything..."]  │  │
│          │ │ [📎 Upload Image] [📤 Send]        │  │
│ Temp:    │ └────────────────────────────────────┘  │
│ ●───── 0.2│                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

---

## CSS Styling

### Chat Message Styles

```css
.chat-message {
    padding: 12px 16px;
    border-radius: 16px;
    margin-bottom: 12px;
    color: white;
    max-width: 75%;
    word-wrap: break-word;
    animation: fadeIn 0.3s ease-in;
}

.user-message {
    background-color: #23234a;
    margin-left: auto;
    text-align: right;
    border-bottom-right-radius: 4px;
}

.assistant-message {
    background-color: #393e46;
    text-align: left;
    border-bottom-left-radius: 4px;
}

.message-role-icon {
    display: inline-block;
    margin-right: 8px;
    font-size: 1.2em;
}

.message-timestamp {
    font-size: 0.75rem;
    color: #9ca3af;
    margin-top: 4px;
}

.typing-indicator {
    display: flex;
    align-items: center;
    padding: 12px;
}

.typing-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #a78bfa;
    margin: 0 4px;
    animation: typing 1.4s infinite;
}

@keyframes typing {
    0%, 60%, 100% { opacity: 0.3; }
    30% { opacity: 1; }
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
```

### Sidebar Chat List Styles

```css
.saved-chat-item {
    padding: 10px 12px;
    margin: 6px 0;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border: 1px solid transparent;
}

.saved-chat-item:hover {
    background-color: #1e1b4b;
    border-color: #a78bfa;
}

.saved-chat-item-active {
    background-color: #23234a;
    border-color: #a78bfa;
    font-weight: 600;
}

.chat-list-empty {
    text-align: center;
    color: #9ca3af;
    font-style: italic;
    padding: 20px 10px;
}
```

---

## Error Handling

### LM Studio Connection Errors

```python
# Health check on page load
if not check_lm_studio_health():
    st.error("⚠️ Cannot connect to LM Studio. Please ensure:")
    st.markdown("""
    1. LM Studio is running
    2. Local server is started (http://localhost:1234)
    3. A vision-capable model is loaded
    """)
    st.stop()
```

### Message Send Errors

```python
try:
    response = send_message(text, image, model, temperature)
except requests.exceptions.ConnectionError:
    st.error("Connection to LM Studio lost. Please check the service.")
except requests.exceptions.Timeout:
    st.error("Request timed out. The model may be processing a large image.")
except Exception as e:
    st.error(f"Error: {str(e)}")
```

### Input Validation

```python
# Empty message check
if send_clicked:
    if not text.strip() and image is None:
        st.warning("Please enter a message or upload an image.")
        return

# Image size check
if image and len(image) > 10 * 1024 * 1024:  # 10MB limit
    st.error("Image too large. Please upload an image smaller than 10MB.")
    return

# Image format check
if image:
    allowed_formats = ['image/png', 'image/jpeg', 'image/jpg']
    # Validate format
```

---

## Testing Strategy

### Backend Tests

1. **LM Studio Service Tests** (`tests/test_lm_studio_service.py`)
   - Test connection to LM Studio
   - Test model listing
   - Test message sending (mock responses)
   - Test streaming response handling
   - Test error handling (connection failures, timeouts)

2. **Chat Service Tests** (`tests/test_chat_service.py`)
   - Test system prompt generation
   - Test context injection
   - Test message formatting
   - Test multimodal message handling (text + image)

3. **API Endpoint Tests** (`tests/test_chat_endpoints.py`)
   - Test POST /chat/message
   - Test POST /chat/stream (SSE format)
   - Test GET /chat/models
   - Test GET /chat/health
   - Test authentication (if required)

### Frontend Tests

1. **Component Tests**
   - Chat message rendering
   - Chat input validation
   - Chat history loading
   - Sidebar interactions

2. **Integration Tests**
   - End-to-end message flow
   - Chat save/load functionality
   - Image upload and display
   - Streaming response display

### Manual Testing Checklist

#### Basic Chat Functionality
- [ ] LM Studio connection works
- [ ] Model selection updates correctly
- [ ] Temperature slider affects responses
- [ ] Text-only messages work
- [ ] Image-only messages work
- [ ] Text + image messages work
- [ ] Streaming displays properly
- [ ] Chat history scrolls correctly
- [ ] New chat creation works
- [ ] Chat loading works
- [ ] Chat deletion works
- [ ] Chat auto-save works (on name generation)
- [ ] System prompt includes F1 context correctly
- [ ] Error messages display correctly
- [ ] Responsive design works on different screen sizes

#### Query Routing
- [ ] General F1 questions receive appropriate responses
- [ ] Telemetry-specific questions are routed correctly
- [ ] Questions about loaded session data get data-enhanced responses
- [ ] Questions about unavailable data receive helpful suggestions
- [ ] Context matching works when telemetry data is loaded
- [ ] Context matching handles missing data gracefully

#### "Ask About This" Integration
- [ ] "Ask AI" buttons appear on all dashboard graphs
- [ ] "Ask AI" buttons appear on comparison page visualizations
- [ ] Clicking button navigates to chat page
- [ ] Chart is captured as image correctly
- [ ] Predefined prompt is formatted with correct context
- [ ] Message auto-sends on navigation
- [ ] Different chart types use appropriate prompts
- [ ] Context variables are correctly injected (driver names, lap numbers, etc.)
- [ ] Can continue conversation after auto-sent message
- [ ] Can send multiple charts in same conversation

---

## Performance Considerations

### Streaming Response

- Use Server-Sent Events (SSE) for real-time streaming
- Display chunks as they arrive (better UX than waiting for full response)
- Accumulate chunks on frontend to maintain full message

### Image Handling

- Compress images before sending (if over certain size)
- Use base64 encoding for API transfer
- Display uploaded image preview before sending
- Limit image size (e.g., max 10MB)

### Session State Management

- Don't store large telemetry data in chat_history
- Store only references/summaries of telemetry context
- Implement chat history pagination if needed (e.g., last 50 messages)
- Clear old chats from session state if memory becomes an issue

### API Timeouts

- Set appropriate timeouts for LM Studio requests (120s default)
- Show loading indicators during API calls
- Implement retry logic for transient failures

---

## Future Enhancements

### Phase 2 Features

1. **Voice Input**
   - Speech-to-text integration (Web Speech API or backend service)
   - Voice message recording and playback
   - Audio transcription display
   - Voice-activated queries

2. **Advanced Query Routing**
   - Machine learning-based query classification
   - Intent recognition improvements
   - Multi-intent query handling
   - Query rewriting for clarity

3. **Chat Export**
   - Export conversation as PDF
   - Export as markdown
   - Copy conversation to clipboard
   - Include embedded images in exports

4. **Advanced Chat Management**
   - Search through chat history
   - Tag/categorize chats by topic
   - Pin important chats
   - Archive old chats
   - Batch operations (delete multiple, merge chats)

5. **Enhanced Context Awareness**
   - Automatically detect when user switches sessions in dashboard
   - Update context in ongoing conversation
   - Conversation summaries between context switches
   - Remember previous conversations across sessions
   - User preferences persistence

6. **Collaboration Features**
   - Share chat conversations (export link)
   - Collaborative chat rooms (multiple users)
   - Comment on specific messages
   - Annotation of telemetry images

7. **Advanced Telemetry Integration**
   - Generate new visualizations on demand ("show me sector 2 speed")
   - Compare multiple drivers in chat ("compare VER, HAM, LEC")
   - Real-time data updates during live sessions
   - Interactive chart manipulation from chat

8. **Smart Suggestions**
   - Suggested follow-up questions
   - Proactive insights based on loaded data
   - Anomaly detection and alerts
   - Strategy recommendations

---

## Dependencies Summary

### Backend New Dependencies

```
openai>=1.0.0          # LM Studio API compatibility (OpenAI format)
aiohttp>=3.9.0         # Async HTTP requests (for streaming)
```

### Frontend New Dependencies

None (all required packages already in requirements.txt)

---

## Implementation Checklist

### Backend Implementation

#### Core Chat Functionality
- [ ] Create `backend/models/chat_models.py`
- [ ] Create `backend/core/lm_studio_config.py`
- [ ] Create `backend/services/chatbot/lm_studio_service.py`
- [ ] Create `backend/services/chatbot/chat_service.py`
- [ ] Create `backend/api/v1/endpoints/chat.py`

#### Query Routing & Templates
- [ ] Create `backend/services/chatbot/query_router.py`
- [ ] Create `backend/services/chatbot/prompt_templates.py`
- [ ] Implement query classification logic
- [ ] Implement context matching logic

#### Integration
- [ ] Update `backend/main.py` (include chat router)
- [ ] Update `backend/requirements.txt`
- [ ] Write backend tests (LM Studio service, chat service, query router)
- [ ] Test LM Studio connection manually

### Frontend Implementation

#### Core Chat Components
- [ ] Create `frontend/utils/chat_state.py`
- [ ] Create `frontend/services/chat_service.py`
- [ ] Create `frontend/components/chatbot/chat_message.py`
- [ ] Create `frontend/components/chatbot/chat_history.py`
- [ ] Create `frontend/components/chatbot/chat_input.py`
- [ ] Create `frontend/components/chatbot/chat_sidebar.py`
- [ ] Create `frontend/components/chatbot/chat_context_panel.py` (optional)

#### "Ask About This" Integration
- [ ] Create `frontend/utils/chat_navigation.py`
- [ ] Create `frontend/components/common/ask_about_button.py`
- [ ] Implement plotly figure to base64 conversion
- [ ] Implement prompt template formatting with context
- [ ] Add "Ask AI about this" buttons to dashboard page (all telemetry graphs)
- [ ] Add "Ask AI about this" buttons to comparison page
- [ ] Test navigation from dashboard → chat with image
- [ ] Test navigation from comparison → chat with image

#### Main Chat Page
- [ ] Update `frontend/pages/chat.py` (full implementation)
- [ ] Handle pending messages from other pages
- [ ] Implement auto-send functionality
- [ ] Add CSS styles to `frontend/app/styles.py` or component files

#### Testing
- [ ] Test frontend components individually
- [ ] Test full chat flow
- [ ] Test "Ask about this" workflow end-to-end

### Integration & Testing

#### Basic Functionality
- [ ] Start LM Studio and load a vision model
- [ ] Test backend API endpoints (Postman/curl)
- [ ] Test frontend-backend integration
- [ ] Test streaming responses
- [ ] Test image upload and analysis
- [ ] Test chat save/load/delete
- [ ] Test error scenarios

#### Query Routing Tests
- [ ] Test query classification for different question types
- [ ] Test context matching (with/without loaded telemetry data)
- [ ] Test response strategies (general vs data-enhanced)
- [ ] Test handling of ambiguous queries

#### "Ask About This" Tests
- [ ] Test image capture from plotly figures
- [ ] Test prompt template rendering with context variables
- [ ] Test navigation from dashboard to chat
- [ ] Test navigation from comparison to chat
- [ ] Test auto-send functionality
- [ ] Test different chart types (speed, brake, throttle, comparison, delta)
- [ ] Verify correct context is passed to LLM

#### Performance & UX
- [ ] Performance testing
- [ ] UI/UX review
- [ ] Test responsive design on different screen sizes
- [ ] Test with different LM Studio models

### Documentation

- [ ] Update API documentation (`docs/API.md`)
- [ ] Update architecture documentation (`docs/ARCHITECTURE.md`)
- [ ] Add chat usage guide to README
- [ ] Document LM Studio setup instructions
- [ ] Add troubleshooting guide

---

## LM Studio Setup Instructions

### Installation

1. Download LM Studio from [https://lmstudio.ai/](https://lmstudio.ai/)
2. Install and launch the application
3. Download a vision-capable model (recommended):
   - `llama-3.2-vision-11b`
   - `bakllava-1-7b`
   - `llava-v1.6-mistral-7b`

### Configuration

1. Open LM Studio settings
2. Start the local server:
   - Click "Local Server" tab
   - Select the downloaded vision model
   - Click "Start Server"
   - Verify it's running on `http://localhost:1234`

3. Test the server:
   ```bash
   curl http://localhost:1234/v1/models
   ```

### Model Selection Criteria

- **Vision capability**: Required for image analysis
- **Context length**: At least 8K tokens (for conversation history)
- **Performance**: 7B-11B parameter models provide good balance
- **VRAM requirements**: Check your GPU memory (8GB+ recommended)

---

## Troubleshooting Guide

### Common Issues

**Issue: "Cannot connect to LM Studio"**
- Solution: Ensure LM Studio local server is running on port 1234
- Check: `curl http://localhost:1234/v1/models`

**Issue: "Model not responding"**
- Solution: Model may be loading; wait 10-15 seconds
- Check: LM Studio console for loading status

**Issue: "Image not analyzed"**
- Solution: Ensure a vision-capable model is loaded
- Check: Model name includes "vision" or "llava"

**Issue: "Streaming not working"**
- Solution: Check backend SSE implementation
- Check: Browser console for connection errors

**Issue: "Chat history not saving"**
- Solution: Check session state initialization
- Check: Browser storage not disabled

---

## Conclusion

This implementation plan provides a comprehensive roadmap for integrating an AI chat assistant into the F1 Telemetry Manager. The design maintains consistency with the existing architecture, follows established patterns, and provides a solid foundation for future enhancements.

**Key Principles:**
- Modular component design
- Separation of concerns (UI/logic/API)
- Consistent styling with existing theme
- Error handling and user feedback
- Performance optimization
- Extensibility for future features

**Next Steps:**
1. Review and approve this plan
2. Set up LM Studio locally
3. Begin backend implementation
4. Develop frontend components
5. Integration testing
6. User acceptance testing
7. Documentation
8. Deployment
