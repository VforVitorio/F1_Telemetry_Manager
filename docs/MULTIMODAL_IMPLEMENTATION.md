# 🖼️ Multimodal Implementation - Vision Support

## ✅ Status: COMPLETED & OPTIMIZED

Complete multimodal support for sending telemetry chart images to vision-capable LLMs with intelligent history compression and automatic retry mechanisms.

---

## 🎯 Overview

The system supports sending F1 telemetry charts directly to vision models (Qwen3-VL, LLaVA) through the "Ask about this" (🤖) buttons. Images are automatically optimized, compressed, and sent with configurable timeout handling.

**Key Features:**
- **Smart History Compression**: Automatic summarization after 5 interactions
- **Infinite Timeout**: Vision models process without time limits
- **Image Optimization**: 768×480 JPEG format at 85% quality
- **Automatic Retry**: Fallback to text-only if vision fails
- **Data URI Format**: Optimized base64 encoding for multimodal queries

---

## 🔧 Implementation Details

### 1. Chat History Compression

**File:** `backend/services/chatbot/lmstudio_service.py`

**Configuration:**
```python
MAX_INTERACTIONS = 5  # Keep last 5 message pairs
DEFAULT_TIMEOUT = None  # Infinite timeout for vision models
```

**Functionality:**
- Monitors chat history length
- When exceeding 5 interactions, summarizes old messages using LLM
- Keeps recent context while reducing token usage
- Preserves conversation flow without losing context

### 2. Vision Model Timeout Configuration

**File:** `backend/services/chatbot/lmstudio_service.py`

**Settings:**
```python
DEFAULT_TIMEOUT = None  # Allows unlimited processing time
```

**Rationale:**
- Vision models require more processing time than text-only
- Complex chart analysis may take several seconds
- Prevents premature request cancellation

### 3. Image Optimization

**File:** `frontend/utils/chat_navigation.py`

**Function:** `plotly_fig_to_base64()`

**Optimization:**
```python
fig.write_image(
    buffer,
    format="jpeg",
    width=768,
    height=480,
    engine="kaleido"
)
```

**Benefits:**
- Reduced file size (JPEG vs PNG)
- Optimal resolution for vision models
- Faster upload/processing times
- Maintains chart readability

### 4. Multimodal Message Format

**File:** `backend/services/chatbot/lmstudio_service.py`

**Function:** `build_messages()`

**Format (OpenAI Vision API compatible):**
```python
{
    "role": "user",
    "content": [
        {
            "type": "text",
            "text": "Analyze this telemetry chart..."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "data:image/jpeg;base64,/9j/4AAQ..."
            }
        }
    ]
}
```

### 5. Auto-Send from Dashboard

**File:** `frontend/pages/chat.py`

**Function:** `handle_pending_message()`

**Workflow:**
1. User clicks 🤖 button on telemetry chart
2. Chart converted to optimized base64 image
3. Session state stores pending message
4. Chat page auto-detects and sends immediately
5. No manual user intervention required

### 6. Retry Mechanism

**File:** `backend/api/v1/endpoints/chat.py`

**Implementation:**
- If vision model fails, automatically retries with text-only prompt
- Graceful degradation ensures service continuity
- Logs errors for debugging while maintaining user experience

---

## 📊 Complete Data Flow

```
┌─────────────────────────────────────────────┐
│ 1. User clicks 🤖 on telemetry chart        │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 2. Chart → Base64 (768×480 JPEG, 85%)      │
│    Format: data:image/jpeg;base64,...       │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 3. Store in session_state.pending_message   │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 4. Navigate to chat page                    │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 5. Auto-send via handle_pending_message()   │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 6. POST /api/v1/chat/message                │
│    {"text": "...", "image": "data:..."}     │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 7. build_messages() - multimodal format     │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 8. Check history length → compress if >5    │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 9. Send to LM Studio (timeout=None)         │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 10. Vision model analyzes chart             │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ 11. Response → Frontend → Display           │
└─────────────────────────────────────────────┘
```

---

## 🧪 Testing Guide

### 1. Setup

**Backend:**
```bash
cd backend
uvicorn main:app --reload --port 8000
```

**LM Studio:**
1. Load vision model: **Qwen3-VL-4B-Instruct**
2. Developer → Start Server (port 1234)

**Frontend:**
```bash
cd frontend
streamlit run app/main.py
```

### 2. Test Workflow

1. Navigate to Dashboard or Comparison page
2. Generate any telemetry chart
3. Click 🤖 button next to chart
4. Verify:
   - ✅ Auto-redirect to chat page
   - ✅ Image appears in chat
   - ✅ Prompt appears automatically
   - ✅ LLM responds analyzing the chart

### 3. Test History Compression

1. Send 6+ messages in chat
2. Check backend logs for compression message
3. Verify conversation context maintained

### 4. Test Retry Mechanism

1. Stop LM Studio vision model
2. Send image query
3. Verify automatic retry with text-only mode

---

## 🔍 Debugging

### Check LM Studio Model

```bash
curl http://localhost:1234/v1/models
```

Expected: Vision model listed (Qwen3-VL, LLaVA)

### Monitor Backend Logs

```bash
# Look for compression triggers
grep "Compressing chat history" backend.log

# Check multimodal message creation
grep "Built multimodal message" backend.log
```

### Test API Directly

```bash
curl -X POST "http://localhost:8000/api/v1/chat/message" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Analyze this chart",
    "image": "data:image/jpeg;base64,..."
  }'
```

---

## 📝 Modified Files Summary

### Backend
- `backend/services/chatbot/lmstudio_service.py`
  - Added: `_compress_chat_history()` function
  - Added: `MAX_INTERACTIONS`, `DEFAULT_TIMEOUT` constants
  - Modified: `build_messages()` with compression logic
  
- `backend/api/v1/endpoints/chat.py`
  - Added: Retry mechanism on vision failure
  - Modified: Endpoints pass `image_base64` parameter

### Frontend
- `frontend/pages/chat.py`
  - Added: `handle_pending_message()` for auto-send
  - Modified: `handle_send_message()` improved image handling

- `frontend/utils/chat_navigation.py`
  - Modified: `plotly_fig_to_base64()` with 768×480 JPEG optimization

- `frontend/services/chat_service.py`
  - Modified: Image parameter type to `Optional[str]`

---

## 🎯 Future Enhancements

### Potential Improvements

1. **Adaptive Image Compression**
   - Adjust quality based on network speed
   - Progressive loading for large images

2. **Multi-Image Support**
   - Compare multiple charts in single query
   - Side-by-side analysis

3. **Image Caching**
   - Avoid re-uploading identical charts
   - Reference previously sent images

4. **Advanced Vision Analysis**
   - Automatic element detection in charts
   - Data extraction from visualizations

5. **Streaming with Vision**
   - Real-time response streaming for multimodal queries

---

## 🎉 Current Capabilities

**Fully Functional:**

✅ Capture telemetry charts as optimized images
✅ Auto-send to chat with predefined prompts
✅ Smart history compression (LLM-powered summarization)
✅ Infinite timeout for complex vision processing
✅ Automatic retry on vision model failure
✅ Data URI format with base64 encoding
✅ 768×480 JPEG optimization for best performance

**The complete workflow from chart visualization to vision model analysis is production-ready.**

---

**Implementation Date:** November 2025  
**Last Updated:** January 2025  
**Status:** ✅ Production Ready
