# F1 Query Router - Complete Guide

## Overview

The **F1 Query Router** is an intelligent query routing system that automatically classifies user questions and directs them to the appropriate specialized handler, ensuring optimized and contextualized responses.

## System Architecture

```
┌─────────────────────────────────────────────┐
│          USER QUERY                         │
│  "Compare Hamilton vs Verstappen lap times" │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│       QUERY CLASSIFIER                      │
│  (LLM-based + Rule-based Fallback)          │
└──────────────────┬──────────────────────────┘
                   │
                   ↓ Detected: COMPARISON_QUERY
┌─────────────────────────────────────────────┐
│       QUERY ROUTER                          │
│  Routes to appropriate handler              │
└──────────────────┬──────────────────────────┘
                   │
      ┌────────────┼────────────────┬─────────┬──────────┐
      ↓            ↓                ↓         ↓          ↓
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────┐
│  BASIC   │ │TECHNICAL │ │COMPARISON│ │REPORT│ │DOWNLD│
│  HANDLER │ │ HANDLER  │ │ HANDLER  │ │ HDL  │ │ HDL  │
└──────────┘ └──────────┘ └──────────┘ └──────┘ └──────┘
      │            │                │         │          │
      └────────────┼────────────────┴─────────┴──────────┘
                   ↓
┌─────────────────────────────────────────────┐
│    SPECIALIZED RESPONSE                     │
│  Optimized for query type                   │
└─────────────────────────────────────────────┘
```

## Supported Query Types

### 1. BASIC QUERY - General Questions

**Description**: Simple questions about F1 concepts, terminology, rules, and general information.

**Examples**:
- "What is DRS?"
- "Explain the F1 points system"
- "Who won the Monaco GP in 2023?"
- "What are tire compounds?"
- "Explain pole position"

**Handler Characteristics**:
- Educational and accessible responses
- Adapted to different knowledge levels (beginner to expert)
- Focus on clarity and comprehension
- No telemetry data required

**System Prompt**: [basic_query_prompt.md](../backend/services/chatbot/prompts/basic_query_prompt.md)

---

### 2. TECHNICAL QUERY - Telemetry Analysis

**Description**: Advanced technical analysis requiring telemetry data, performance metrics, and engineering insights.

**Examples**:
- "Show throttle application in sector 2"
- "Analyze brake pressure data on lap 15"
- "What was the top speed on the straight?"
- "Show RPM curves for the fastest lap"
- "Explain the tire degradation pattern"

**Handler Characteristics**:
- Detailed telemetry analysis
- Race engineering insights
- Technical explanations with professional terminology
- Performance optimization recommendations

**Telemetry Channels Analyzed**:
- Speed (km/h)
- Throttle (0-100%)
- Brake (0-100%)
- RPM
- Gear (1-8)
- DRS (activation)
- G-forces (lateral and longitudinal)
- Tire temperatures

**System Prompt**: [technical_query_prompt.md](../backend/services/chatbot/prompts/technical_query_prompt.md)

---

### 3. COMPARISON QUERY - Multi-Driver Analysis

**Description**: Multi-driver or multi-lap comparisons with statistical analysis and performance deltas.

**Examples**:
- "Compare Hamilton vs Verstappen lap times"
- "Show the delta between their fastest laps"
- "Who was faster in sector 1, Leclerc or Sainz?"
- "Compare race pace of top 3 drivers"
- "Analyze performance gap between teammates"

**Handler Characteristics**:
- Side-by-side analysis
- Delta calculations (time, speed, percentage)
- Sector-by-sector breakdown
- Statistical significance insights
- Objective data-driven comparisons

**Comparison Types**:
- Driver vs Driver
- Lap vs Lap
- Session vs Session
- Teammate comparisons
- Year vs Year

**System Prompt**: [comparison_query_prompt.md](../backend/services/chatbot/prompts/comparison_query_prompt.md)

---

### 4. REPORT REQUEST - Conversation Summaries

**Description**: Generation of professional summaries and reports from previous conversations and analysis.

**Examples**:
- "Generate a summary of our conversation"
- "Create a report of the analysis we did"
- "Export this conversation as a document"
- "Summarize the key findings"
- "Make a PDF report of this chat"

**Handler Characteristics**:
- Multi-turn conversation consolidation
- Professional structure (Executive Summary, Findings, Conclusions)
- Markdown format for easy export
- Technical accuracy preservation
- Key insights extraction

**Report Structure**:
1. **Executive Summary**: 2-3 sentence overview
2. **Topics Discussed**: Main topics covered
3. **Key Findings**: Primary discoveries
4. **Detailed Analysis**: In-depth technical analysis
5. **Technical Details**: Specific data and metrics
6. **Conclusions**: Final summary and recommendations

**System Prompt**: [report_handler_prompt.md](../backend/services/chatbot/prompts/report_handler_prompt.md)

---

### 5. DOWNLOAD REQUEST - Data Export

**Description**: Export telemetry data, analysis results, and race data in various formats.

**Examples**:
- "Download telemetry data as CSV"
- "Export to JSON"
- "Can I get this in Excel format?"
- "Download the lap times table"
- "Export all analyzed data"

**Supported Formats**:
- **CSV**: For Excel, spreadsheets, general analysis
- **JSON**: For web apps, APIs, programmatic use
- **Excel (XLSX)**: For professional reports, multiple sheets
- **Parquet**: For big data, data science (Pandas, Spark)

**Handler Characteristics**:
- Automatic format detection
- Guidance on best format for each use case
- Data structure description
- Usage recommendations

**System Prompt**: [download_handler_prompt.md](../backend/services/chatbot/prompts/download_handler_prompt.md)

---

## Classification System

### LLM Classification (Primary)

The system uses an LLM (via LM Studio) to classify queries with high accuracy:

- **Temperature**: 0.1 (low for consistency)
- **Max Tokens**: 50 (short response expected)
- **System Prompt**: [classifier_system_prompt.md](../backend/services/chatbot/prompts/classifier_system_prompt.md)

### Rule-based Classification (Fallback)

If LM Studio is unavailable, the system uses a rule-based classifier:

```python
# Keywords for DOWNLOAD_REQUEST
download_keywords = ['download', 'export', 'csv', 'json', 'excel', 'xlsx']

# Keywords for REPORT_REQUEST
report_keywords = ['report', 'summary', 'summarize', 'document', 'pdf']

# Keywords for COMPARISON_QUERY
comparison_keywords = ['compare', 'versus', 'vs', 'vs.', 'difference between', 'delta']

# Keywords for TECHNICAL_QUERY
technical_keywords = [
    'telemetry', 'speed', 'throttle', 'brake', 'rpm', 'gear',
    'temperature', 'tire', 'tyre', 'sector', 'lap time', 'data'
]

# Default: BASIC_QUERY
```

### POST `/api/v1/chat/query`

**Request Structure**:
```json
{
  "text": "Your question here",
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "chat_history": [],
  "context": {
    "year": 2024,
    "grand_prix": "Monaco",
    "session": "Race",
    "drivers": ["VER", "HAM"]
  },
  "model": null,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Request Parameters**:
- `text` (string, required): User query text
- `image` (string, optional): Base64-encoded image in data URI format (e.g., "data:image/jpeg;base64,...")
- `chat_history` (array, optional): Previous conversation messages
- `context` (object, optional): F1 session context (year, GP, session, drivers)
- `model` (string, optional): Override default LLM model
- `temperature` (float, optional): LLM temperature (0.0-1.0)
- `max_tokens` (integer, optional): Maximum response length

**Multimodal Query Examples**:

1. **Chart Analysis**:
```json
{
  "text": "Analyze the speed profile in this telemetry chart",
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "context": {
    "year": 2024,
    "grand_prix": "Bahrain",
    "session": "Race",
    "drivers": ["VER"]
  }
}
```

2. **Comparison with Image**:
```json
{
  "text": "Compare these two drivers' performance based on this delta chart",
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "context": {
    "drivers": ["HAM", "VER"]
  }
}
```

**Response Structure**:
```json
{
  "type": "COMPARISON_QUERY",
  "handler": "ComparisonQueryHandler",
  "response": "LLM response...",
  "metadata": {
    "query_type": "COMPARISON_QUERY",
    "handler": "ComparisonQueryHandler",
    "processing_time_ms": 1234.56,
    "timestamp": "2024-11-28T12:00:00",
    "llm_model": "qwen3-vl-4b-instruct",
    "tokens_used": 150,
    "used_image": true,
    "image_size_kb": 45.2
  }
}
```

**Automatic Retry Mechanism**:

If a vision model fails to process an image query, the system automatically retries without the image:

```
1. Initial Request: text + image → Vision Model
2. Vision Fails (timeout/error)
3. Automatic Retry: text only → Text-only Model
4. Response: Graceful degradation message + text analysis
```

**Error Handling**:
- Vision model timeout: Automatic retry without image
- Invalid image format: Returns error message with supported formats
- Image too large: Automatic optimization to 768×480 JPEG
- Missing context: Uses default values or asks for clarification

## Testing

### Run Tests

```bash
# Full test (with LM Studio)
python3 backend/test_query_router.py

# Structure and fallback only (without LM Studio)
python3 backend/test_query_router.py <<< "n"
```

### Test Cases

The system includes test cases to validate classification:

```python
test_cases = [
    ("What is DRS?", QueryType.BASIC_QUERY),
    ("Explain the points system", QueryType.BASIC_QUERY),
    ("Show me the throttle data for lap 15", QueryType.TECHNICAL_QUERY),
    ("Analyze brake pressure in sector 2", QueryType.TECHNICAL_QUERY),
    ("Compare Hamilton vs Verstappen lap times", QueryType.COMPARISON_QUERY),
    ("Who was faster, Leclerc or Sainz?", QueryType.COMPARISON_QUERY),
    ("Generate a summary of our conversation", QueryType.REPORT_REQUEST),
    ("Create a report", QueryType.REPORT_REQUEST),
    ("Download the data as CSV", QueryType.DOWNLOAD_REQUEST),
    ("Export to JSON", QueryType.DOWNLOAD_REQUEST),
]
```

## Metrics and Performance

The router provides detailed metrics in each response:

- **processing_time_ms**: Total processing time (includes vision model if applicable)
- **tokens_used**: LLM tokens consumed
- **handler_type**: Type of handler executed
- **used_context**: Whether F1 context was used
- **used_history**: Whether chat history was used
- **used_image**: Whether an image was processed (v1.1+)
- **image_size_kb**: Size of processed image in kilobytes (v1.1+)
- **retry_attempted**: Whether automatic retry was triggered (v1.1+)

**Performance Benchmarks (v1.1)**:
- Text-only queries: 1-3 seconds
- Vision queries (chart analysis): 5-15 seconds
- Retry fallback: +2-3 seconds
- History compression: <2 seconds for 10+ interactions

## Processing Flow

1. **Query Reception**: User sends query via API
2. **Validation**: Validate required fields (`text`)
3. **Classification**: LLM or fallback determines the type
4. **Routing**: Router selects the appropriate handler
5. **Processing**: Specialized handler generates response
6. **Response**: Return result with metadata

## System Prompts

All prompts are centralized in Markdown files for easy maintenance:

```
backend/services/chatbot/prompts/
├── basic_query_prompt.md           # Basic query prompt
├── technical_query_prompt.md       # Technical analysis prompt
├── comparison_query_prompt.md      # Comparison prompt
├── report_handler_prompt.md        # Report generation prompt
├── download_handler_prompt.md      # Download guidance prompt
└── classifier_system_prompt.md     # Classifier prompt
```

### Advantages of File-based Prompts

- Easy editing without touching code
- Version control in Git
- Team collaboration on prompt improvements
- A/B testing of different versions
- Self-documenting prompts
- System includes minimal fallback prompts

## Implementation Status

### v1.0 Complete (October 2025)
- ✅ 5 specialized handlers implemented
- ✅ LLM + rule-based fallback classifier
- ✅ Professional prompts in .md files
- ✅ Integrated testing system
- ✅ Complete documentation
- ✅ Performance metrics and metadata

### v1.1 Complete (November 2025)
- ✅ **Multimodal support**: Vision model integration (Qwen3-VL-4B)
- ✅ **Image parameter**: Base64 data URI format for charts
- ✅ **Automatic retry**: Fallback to text-only on vision failure
- ✅ **Smart compression**: LLM-powered history summarization (5 interactions)
- ✅ **Timeout configuration**: Infinite wait for vision processing (DEFAULT_TIMEOUT=None)
- ✅ **Image optimization**: 768×480 JPEG at 85% quality
- ✅ **Auto-send integration**: Dashboard → Chat with predefined prompts

### v2.0 Planned
- 🔵 Multi-image support (compare multiple charts)
- 🔵 Image caching (avoid re-uploading identical charts)
- 🔵 Streaming with vision (real-time multimodal responses)
- 🔵 Advanced vision analytics (data extraction from charts)

---

**Developed for**: F1 Telemetry Manager  
**Last Updated**: November 2025  
**Version**: 1.1.0

---

# Implementation details

🎯 Query Routing System - Implementación Completa

## 📋 Resumen

Se ha implementado exitosamente un sistema de enrutamiento inteligente de consultas para el F1 Telemetry Manager que automáticamente detecta el tipo de consulta del usuario y la dirige al handler especializado apropiado.

---

## ✅ Componentes Implementados

### 1. Estructura de Directorios

```
backend/services/chatbot/
├── router/
│   ├── __init__.py
│   └── query_router.py          # QueryRouter principal
├── handlers/
│   ├── __init__.py
│   ├── base_handler.py           # Clase base abstracta
│   ├── basic_query_handler.py    # Consultas básicas F1
│   ├── technical_query_handler.py # Análisis técnicos
│   ├── comparison_query_handler.py # Comparaciones multi-driver
│   ├── report_handler.py         # Generación de reportes
│   └── download_handler.py       # Exportación de datos
├── prompts/
│   └── classifier_system_prompt.md # Prompt del clasificador
├── utils/
│   ├── __init__.py
│   ├── query_classifier.py       # Clasificador LLM + fallback
│   └── validators.py             # Validadores de requests
└── llm_service.py           # Servicio LM Studio existente
```

### 2. Tipos de Consultas Soportados

| Tipo | Descripción | Handler |
|------|-------------|---------|
| **BASIC_QUERY** | Conceptos F1, terminología, reglas | BasicQueryHandler |
| **TECHNICAL_QUERY** | Análisis técnicos con telemetría | TechnicalQueryHandler |
| **COMPARISON_QUERY** | Comparaciones multi-driver/lap | ComparisonQueryHandler |
| **REPORT_REQUEST** | Generación de reportes/resúmenes | ReportHandler |
| **DOWNLOAD_REQUEST** | Exportación de datos (CSV/JSON) | DownloadHandler |

### 3. Flujo de Procesamiento

```
Usuario → POST /api/v1/chat/query
    ↓
Validación del request (validators.py)
    ↓
QueryRouter.process_query()
    ↓
QueryClassifier.classify() [LLM-based]
    ↓ (fallback si LM Studio no disponible)
QueryClassifier._fallback_classify() [Rule-based]
    ↓
QueryRouter.route_to_handler()
    ↓
Handler específico.handle()
    ↓
Respuesta con metadata
```

### 4. API Endpoint

**Endpoint:** `POST /api/v1/chat/query`

**Request:**
```json
{
  "text": "What is DRS?",
  "image": null,
  "chat_history": [],
  "context": {
    "year": 2024,
    "grand_prix": "Monaco"
  },
  "model": null,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**
```json
{
  "type": "BASIC_QUERY",
  "handler": "BasicQueryHandler",
  "response": "DRS (Drag Reduction System) is...",
  "metadata": {
    "query_type": "BASIC_QUERY",
    "handler": "BasicQueryHandler",
    "processing_time_ms": 1234.56,
    "timestamp": "2024-11-27T12:00:00",
    "llm_model": "qwen3-vl-4b-instruct",
    "tokens_used": 150
  }
}
```

---

## 🏗️ Arquitectura del Sistema

### QueryRouter (Coordinador Principal)

- **Responsabilidad**: Coordinar todo el flujo de procesamiento
- **Métodos principales**:
  - `detect_query_type()`: Detecta el tipo de consulta
  - `route_to_handler()`: Enruta al handler apropiado
  - `process_query()`: Procesa la consulta completa

### QueryClassifier (Detección Inteligente)

- **Clasificación LLM**: Usa el modelo cargado en LM Studio
- **Fallback Rule-based**: Si LM Studio no disponible, usa palabras clave
- **System Prompt**: Especializado en clasificación de consultas F1

### Handlers (Procesadores Especializados)

Cada handler hereda de `BaseHandler` e implementa:
- **System Prompt específico** para su tipo de consulta
- **Lógica de procesamiento** adaptada
- **Manejo de errores** personalizado
- **Metadata** relevante

---

## 🔧 Características Implementadas

### ✅ Sistema de Clasificación Dual

1. **LLM-based**: Usa el modelo en LM Studio para clasificación precisa
2. **Rule-based**: Fallback automático si LM Studio no está disponible

### ✅ Validación Robusta

- Validación de campos requeridos
- Validación de tipos de datos
- Validación de tamaño de imágenes
- Validación de parámetros (temperature, max_tokens)

### ✅ Logging Completo

- Logs a nivel de router
- Logs a nivel de classifier
- Logs a nivel de handlers
- Tracking de tiempo de procesamiento

### ✅ Manejo de Errores

- `ValidationError`: Errores de validación (400)
- `LLMServiceError`: Errores de conexión/LLM (503)
- `Exception`: Errores generales (500)
- Responses informativos con detalles del error

### ✅ Metadata Rica

Cada response incluye:
- Tipo de query detectado
- Handler utilizado
- Tiempo de procesamiento
- Tokens consumidos
- Modelo LLM usado
- Contexto utilizado
- Metadata específica del handler

---

## 🧪 Testing

### Test Script

Se ha creado `backend/test_query_router.py` que prueba:

1. ✅ Estructura del router (imports, inicialización)
2. ✅ Clasificador fallback (rule-based)
3. ✅ Clasificador completo (con LM Studio)

**Ejecutar tests:**
```bash
python3 backend/test_query_router.py
```

**Resultado de tests:**
```
✅ Router structure is valid!
✅ Fallback classifier working
✅ All handlers registered: 5
```

### Manual Testing

Ver [TEST_ROUTER.md](../backend/services/chatbot/TEST_ROUTER.md) para:
- Ejemplos de curl commands
- Queries de prueba por tipo
- Debugging tips
- Métricas de performance

---

## 📦 Dependencias Añadidas

**requirements.txt:**
```txt
requests==2.31.0  # Para comunicación HTTP con LM Studio
```

---

## 🎨 Integración con Frontend (Próximos Pasos)

### Actualizar chat_service.py

```python
def send_routed_query(text, context=None, chat_history=None):
    """
    Enviar query con enrutamiento automático.
    """
    payload = {
        "text": text,
        "context": context,
        "chat_history": chat_history,
        "temperature": 0.7,
        "max_tokens": 1000
    }

    response = requests.post(
        f"{BACKEND_URL}/api/v1/chat/query",
        json=payload
    )

    if response.status_code == 200:
        result = response.json()
        return {
            "response": result["response"],
            "type": result["type"],
            "handler": result["handler"],
            "metadata": result["metadata"]
        }
    else:
        raise Exception(f"Error: {response.text}")
```

### Mostrar Tipo de Query en UI

```python
# En chat_message.py o similar
if st.session_state.show_query_metadata:
    with st.expander("📊 Query Info"):
        st.write(f"**Type:** {response['type']}")
        st.write(f"**Handler:** {response['handler']}")
        st.write(f"**Processing Time:** {response['metadata']['processing_time_ms']:.2f}ms")
        st.write(f"**Tokens:** {response['metadata'].get('tokens_used', 'N/A')}")
```

---

## 🚀 Roadmap: Fase 2 - Soporte Multimodal (Qwen3 VL 4B)

### Estado Actual
✅ **Fase 1 Completada**: Sistema de routing implementado y funcionando

### Próximos Pasos para Qwen3 VL 4B

#### 1. Actualizar llm_service.py

**Archivo:** [backend/services/chatbot/llm_service.py](../backend/services/chatbot/llm_service.py:1)

Modificar función `build_messages()`:

```python
def build_messages(
    user_message: str,
    image_base64: Optional[str] = None,  # ← NUEVO
    system_prompt: Optional[str] = None,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """Build messages with optional image support."""

    messages = []

    # System prompt
    if not system_prompt:
        system_prompt = "You are a helpful F1 Strategy Assistant..."

    # Add context
    if context:
        context_str = "\n\nCurrent F1 Session Context:\n"
        # ... existing context code ...
        system_prompt += context_str

    messages.append({
        "role": "system",
        "content": system_prompt
    })

    # Chat history
    if chat_history:
        for msg in chat_history:
            # ... existing history code ...
            pass

    # Current user message with optional image
    if image_base64:
        # Multimodal message for Qwen3 VL
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": user_message
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": image_base64  # data:image/jpeg;base64,...
                    }
                }
            ]
        })
    else:
        # Text-only message
        messages.append({
            "role": "user",
            "content": user_message
        })

    return messages
```

#### 2. Actualizar Handlers para Imágenes

**Handlers que deben soportar imágenes:**

- ✅ `TechnicalQueryHandler`: Analizar gráficos de telemetría
- ✅ `ComparisonQueryHandler`: Analizar gráficos de comparación
- ⚠️ `BasicQueryHandler`: Opcional (no crítico)
- ❌ `ReportHandler`: No necesario
- ❌ `DownloadHandler`: No necesario

**Ejemplo de actualización:**

```python
# En technical_query_handler.py
def handle(self, message, image=None, **kwargs):
    # ...
    messages = build_messages(
        user_message=message,
        image_base64=image,  # ← Pasar imagen
        system_prompt=self.system_prompt,
        chat_history=chat_history,
        context=context
    )
    # ...
```

#### 3. Frontend: Upload de Imágenes

**Archivo:** `frontend/components/chatbot/chat_input.py`

```python
import streamlit as st
import base64

# Image upload widget
uploaded_image = st.file_uploader(
    "📸 Adjuntar imagen (opcional)",
    type=["jpg", "jpeg", "png", "webp"],
    key="chat_image_uploader"
)

if uploaded_image:
    # Preview
    st.image(uploaded_image, width=300)

    # Convert to base64
    image_bytes = uploaded_image.read()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    mime_type = uploaded_image.type
    image_data = f"data:{mime_type};base64,{image_base64}"

    # Include in payload
    payload["image"] = image_data
```

#### 4. Configuración de LM Studio

1. **Descargar modelo**:
   - Buscar en LM Studio: `qwen3-vl-4b-instruct`
   - Versión recomendada: Q4_K_M (balance rendimiento/calidad)

2. **Cargar modelo**:
   - Chat tab → Select model
   - Ajustar parámetros según hardware

3. **Iniciar servidor**:
   - Developer → Start Server
   - Puerto: 1234 (default)

#### 5. Testing Multimodal

```bash
# Test con imagen
curl -X POST "http://localhost:8000/api/v1/chat/query" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Analyze this telemetry chart",
    "image": "data:image/jpeg;base64,/9j/4AAQ...",
    "temperature": 0.7
  }'
```

---

## 📚 Documentación Adicional

- [TEST_ROUTER.md](../backend/services/chatbot/TEST_ROUTER.md): Guía completa de testing
- [classifier_system_prompt.md](../backend/services/chatbot/prompts/classifier_system_prompt.md): Prompt del clasificador
- [ROADMAP.md (original)](./ROADMAP_QWEN3_VL.md): Roadmap completo de implementación

---

## 🎯 Estado Actual

### ✅ Completado (Fase 1)

- [x] Estructura de carpetas del router
- [x] QueryRouter class con detección de tipo
- [x] 5 Handlers especializados
- [x] Sistema de prompts para clasificador
- [x] Endpoint `/query` con enrutamiento
- [x] Manejo de errores y logging
- [x] Validadores
- [x] Tests automatizados
- [x] Documentación completa

### 🚧 Pendiente (Fase 2)

- [ ] Soporte multimodal en `build_messages()`
- [ ] Actualizar handlers para imágenes
- [ ] Frontend: upload de imágenes
- [ ] Integración con servicios de telemetría
- [ ] Generación real de descargas
- [ ] Generación real de reportes PDF

---

## 🏁 Cómo Continuar

### 1. Probar el Sistema Actual

```bash
# Iniciar backend
cd backend
python3 -m uvicorn main:app --reload --port 8000

# En otra terminal, probar
curl -X POST "http://localhost:8000/api/v1/chat/query" \
  -H "Content-Type: application/json" \
  -d '{"text": "What is DRS?"}'
```

### 2. Configurar LM Studio

1. Descargar e instalar LM Studio
2. Descargar modelo Qwen3 VL 4B
3. Iniciar servidor en puerto 1234

### 3. Implementar Fase 2 (Multimodal)

Seguir los pasos descritos en la sección "Roadmap: Fase 2"

### 4. Integrar con Frontend

Actualizar Streamlit para usar el nuevo endpoint `/query`

---

## 📞 Soporte

Para dudas o problemas:
1. Revisar logs del backend
2. Ejecutar `test_query_router.py`
3. Verificar LM Studio health: `GET /api/v1/chat/health`
4. Consultar [TEST_ROUTER.md](../backend/services/chatbot/TEST_ROUTER.md)

---

**Última actualización:** 2024-11-27
**Estado:** ✅ Fase 1 Completada - Sistema de Routing Operacional
