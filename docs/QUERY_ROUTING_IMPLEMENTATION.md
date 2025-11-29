# 🎯 Query Routing System - Implementación Completa

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
└── lmstudio_service.py           # Servicio LM Studio existente
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
- `LMStudioError`: Errores de conexión/LLM (503)
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

#### 1. Actualizar lmstudio_service.py

**Archivo:** [backend/services/chatbot/lmstudio_service.py](../backend/services/chatbot/lmstudio_service.py:1)

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
