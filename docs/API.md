# API Documentation

Complete REST API documentation for the F1 Telemetry Manager backend service.

**Base URL**: `http://localhost:8000/api/v1`

---

## Authentication

### Register User
**POST** `/auth/register`

Creates a new user account.

**Request Body**:
- `username` (string): Unique username
- `email` (string): Valid email address
- `password` (string): Minimum 8 characters

**Response**: `201 Created`
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string"
}
```

### Login
**POST** `/auth/login`

Authenticates user and returns access token.

**Request Body**:
- `username` (string)
- `password` (string)

**Response**: `200 OK`
```json
{
  "access_token": "string",
  "token_type": "bearer"
}
```

---

## Chat Endpoints

### Send Chat Message
**POST** `/chat/message`

Sends a text or multimodal message to the chatbot.

**Headers**:
- `Authorization: Bearer {token}`

**Request Body**:
- `message` (string): User message text
- `image_base64` (string, optional): Base64-encoded image for vision analysis
- `session_id` (string, optional): Chat session identifier

**Response**: `200 OK`
```json
{
  "response": "string",
  "session_id": "string",
  "timestamp": "ISO8601"
}
```

**Features**:
- Automatic retry if vision model fails
- Smart history compression (keeps last 5 interactions)
- Supports multimodal queries with images

### Stream Chat Response
**POST** `/chat/stream`

Streams chatbot response in real-time (SSE).

**Request Body**: Same as `/chat/message`

**Response**: `200 OK` (Server-Sent Events)
```
data: {"chunk": "Response", "done": false}
data: {"chunk": " text", "done": false}
data: {"chunk": "", "done": true}
```

### Query Router
**POST** `/chat/query`

Intelligent query routing based on content type.

**Request Body**:
- `query` (string): User query
- `image_base64` (string, optional): Chart or telemetry image

**Response**: `200 OK`
```json
{
  "query_type": "telemetry|general|vision",
  "result": "object|string",
  "metadata": {}
}
```

**Query Types**:
- **Telemetry**: F1 data analysis requests
- **General**: Non-F1 questions
- **Vision**: Image analysis queries

---

## Telemetry Endpoints

### Get Sessions
**GET** `/telemetry/sessions?year={year}`

Retrieves available F1 sessions (races, qualifying, sprint).

**Query Parameters**:
- `year` (integer): Season year (e.g., 2024)

**Response**: `200 OK`
```json
{
  "sessions": [
    {
      "name": "Bahrain Grand Prix",
      "date": "2024-03-02",
      "types": ["race", "qualifying", "sprint"]
    }
  ]
}
```

### Get Lap Data
**POST** `/telemetry/laps`

Fetches detailed lap telemetry for specific driver.

**Request Body**:
- `year` (integer)
- `event_name` (string)
- `session_type` (string): "race", "qualifying", or "sprint"
- `driver` (string): Driver code (e.g., "VER")
- `lap_number` (integer, optional)

**Response**: `200 OK`
```json
{
  "laps": [
    {
      "lap": 1,
      "time": "1:32.123",
      "speed": [320, 315, ...],
      "throttle": [100, 98, ...],
      "drs": [0, 0, 1, ...]
    }
  ]
}
```

### Compare Drivers
**POST** `/telemetry/compare`

Compares telemetry between two drivers.

**Request Body**:
- `year` (integer)
- `event_name` (string)
- `session_type` (string)
- `driver1` (string)
- `driver2` (string)
- `lap_number` (integer, optional)

**Response**: `200 OK` - Returns comparison data with deltas

---

## Voice Endpoints

### Start Voice Chat
**POST** `/voice/start`

Initializes voice chat session.

**Response**: `200 OK`
```json
{
  "session_id": "string",
  "status": "active"
}
```

### Transcribe Audio
**POST** `/voice/transcribe`

Transcribes audio using Whisper (medium model).

**Request**: `multipart/form-data`
- `audio` (file): Audio file (wav, mp3, webm)

**Response**: `200 OK`
```json
{
  "text": "transcribed speech",
  "language": "en"
}
```

### Text-to-Speech
**POST** `/voice/tts`

Converts text response to speech.

**Request Body**:
- `text` (string): Text to synthesize

**Response**: `200 OK` (audio/wav)

---

## Report Endpoints

### Export Report
**POST** `/reports/export`

Exports chat conversation as PDF/HTML report.

**Request Body**:
- `session_id` (string)
- `format` (string): "pdf" or "html"
- `title` (string, optional)

**Response**: `200 OK` (file download)

### List Reports
**GET** `/reports/list`

Retrieves saved report history.

**Response**: `200 OK`
```json
{
  "reports": [
    {
      "id": "string",
      "title": "string",
      "created_at": "ISO8601",
      "format": "pdf"
    }
  ]
}
```

---

## Error Responses

All endpoints may return these error codes:

**400 Bad Request**
```json
{
  "detail": "Invalid request parameters"
}
```

**401 Unauthorized**
```json
{
  "detail": "Invalid or expired token"
}
```

**404 Not Found**
```json
{
  "detail": "Resource not found"
}
```

**500 Internal Server Error**
```json
{
  "detail": "Internal processing error",
  "trace_id": "string"
}
```

---

## Rate Limits

- **Chat Endpoints**: 60 requests/minute
- **Telemetry**: 120 requests/minute
- **Voice**: 30 requests/minute

---

## Configuration

### Timeout Settings

Vision models use infinite timeout (`DEFAULT_TIMEOUT = None`) to handle complex image processing.

### Chat Compression

History automatically compresses after 5 interactions (`MAX_INTERACTIONS = 5`) using LLM-powered summarization.

### Image Optimization

Charts converted to 768×480 JPEG format with 85% quality for optimal vision model performance.
