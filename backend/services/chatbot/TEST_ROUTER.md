# Query Router Testing Guide

Este documento proporciona ejemplos de cómo probar el nuevo sistema de enrutamiento de consultas.

## 🎯 Endpoint Principal

```
POST /api/v1/chat/query
```

## 📋 Estructura de Request

```json
{
  "text": "Tu pregunta aquí",
  "image": null,  // Opcional: imagen en base64
  "chat_history": [],  // Opcional: historial de chat
  "context": {  // Opcional: contexto de sesión F1
    "year": 2024,
    "grand_prix": "Monaco",
    "session": "Race",
    "drivers": ["VER", "HAM"]
  },
  "model": null,  // Opcional: modelo específico
  "temperature": 0.7,
  "max_tokens": 1000
}
```

## 📊 Estructura de Response

```json
{
  "type": "BASIC_QUERY",  // Tipo detectado
  "handler": "BasicQueryHandler",  // Handler utilizado
  "response": "Respuesta del LLM...",
  "metadata": {
    "query_type": "BASIC_QUERY",
    "handler": "BasicQueryHandler",
    "processing_time_ms": 1234.56,
    "timestamp": "2024-11-27T12:00:00",
    "llm_model": "qwen2-vl-4b-instruct",
    "tokens_used": 150,
    // ... metadata adicional del handler
  }
}
```

## 🧪 Ejemplos de Prueba

### 1. BASIC_QUERY - Consulta Básica

```bash
curl -X POST "http://localhost:8000/api/v1/chat/query" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What is DRS in Formula 1?",
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

**Queries de ejemplo:**
- "What is DRS?"
- "Explain the points system in F1"
- "Who won the Monaco GP in 2023?"
- "What are tire compounds?"

### 2. TECHNICAL_QUERY - Análisis Técnico

```bash
curl -X POST "http://localhost:8000/api/v1/chat/query" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Show me the throttle application in sector 2",
    "context": {
      "year": 2024,
      "grand_prix": "Monaco",
      "session": "Qualifying",
      "drivers": ["VER"]
    },
    "temperature": 0.7,
    "max_tokens": 1500
  }'
```

**Queries de ejemplo:**
- "Analyze the brake pressure data for lap 15"
- "What was the top speed in the straight?"
- "Show RPM curves for the fastest lap"
- "Explain the tire degradation pattern"

### 3. COMPARISON_QUERY - Comparación Multi-Piloto

```bash
curl -X POST "http://localhost:8000/api/v1/chat/query" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Compare Hamilton vs Verstappen lap times",
    "context": {
      "year": 2024,
      "grand_prix": "Monaco",
      "session": "Race",
      "drivers": ["HAM", "VER"]
    },
    "temperature": 0.7,
    "max_tokens": 1500
  }'
```

**Queries de ejemplo:**
- "Compare Hamilton vs Verstappen lap times"
- "Show me the delta between Leclerc and Sainz"
- "Who was faster in sector 1?"
- "Compare the race pace of the top 3 drivers"

### 4. REPORT_REQUEST - Generación de Reportes

```bash
curl -X POST "http://localhost:8000/api/v1/chat/query" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Generate a summary of our conversation",
    "chat_history": [
      {"role": "user", "content": "What is DRS?"},
      {"role": "assistant", "content": "DRS is..."},
      {"role": "user", "content": "How does it work?"},
      {"role": "assistant", "content": "It works by..."}
    ],
    "temperature": 0.5,
    "max_tokens": 2000
  }'
```

**Queries de ejemplo:**
- "Generate a summary of our conversation"
- "Create a report of the analysis"
- "Summarize the key findings"
- "Make a PDF report"

### 5. DOWNLOAD_REQUEST - Descarga de Datos

```bash
curl -X POST "http://localhost:8000/api/v1/chat/query" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Download the telemetry data as CSV",
    "context": {
      "year": 2024,
      "grand_prix": "Monaco",
      "session": "Race",
      "drivers": ["VER"]
    },
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

**Queries de ejemplo:**
- "Download the data as CSV"
- "Export to JSON"
- "Can I get this in Excel format?"
- "Export the lap times table"

## 🔍 Verificación del Sistema

### 1. Health Check de LM Studio

```bash
curl -X GET "http://localhost:8000/api/v1/chat/health"
```

Respuesta esperada:
```json
{
  "status": "healthy",
  "lm_studio_reachable": true,
  "message": "LM Studio is running",
  "models_available": 1
}
```

### 2. Listar Modelos Disponibles

```bash
curl -X GET "http://localhost:8000/api/v1/chat/models"
```

### 3. Test de Clasificación Manual

Puedes probar la clasificación directamente en Python:

```python
from backend.services.chatbot.utils.query_classifier import QueryClassifier

classifier = QueryClassifier()

# Test queries
queries = [
    "What is DRS?",
    "Show me the throttle data",
    "Compare Hamilton vs Verstappen",
    "Generate a summary",
    "Download as CSV"
]

for query in queries:
    query_type = classifier.classify(query)
    print(f"{query} -> {query_type.value}")
```

## 🐛 Debugging

### Logs del Router

Los logs se generan en varios niveles:

1. **QueryClassifier**: Detección del tipo de consulta
2. **QueryRouter**: Enrutamiento y procesamiento
3. **Handlers**: Ejecución específica

Para ver los logs en tiempo real:

```bash
tail -f backend.log | grep -E "(QueryClassifier|QueryRouter|Handler)"
```

### Fallback Classifier

Si LM Studio no está disponible, el sistema usa un clasificador basado en reglas que detecta palabras clave. Puedes probarlo desconectando LM Studio.

### Errores Comunes

1. **LM Studio no conecta**:
   ```json
   {
     "detail": "Cannot connect to LM Studio. Ensure LM Studio is running..."
   }
   ```
   - Verificar que LM Studio esté corriendo en `localhost:1234`
   - Verificar que el servidor esté iniciado en LM Studio

2. **Modelo no cargado**:
   - Ir a LM Studio → Chat tab
   - Cargar el modelo Qwen3 VL 4B
   - Iniciar el servidor

3. **Validation Error**:
   ```json
   {
     "detail": "Missing required field: 'text'"
   }
   ```
   - Verificar que el payload incluya el campo `text`

## 📊 Métricas de Performance

El sistema retorna métricas en el campo `metadata`:

- `processing_time_ms`: Tiempo total de procesamiento
- `tokens_used`: Tokens consumidos del LLM
- `handler_type`: Tipo de handler ejecutado
- `used_context`: Si se usó contexto F1
- `used_history`: Si se usó historial de chat

## 🔄 Integración con Frontend

Para integrar con Streamlit, actualizar `chat_service.py`:

```python
import requests

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
        "http://localhost:8000/api/v1/chat/query",
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
        raise Exception(f"Error: {response.status_code}")
```

## 🎯 Próximos Pasos

1. **Fase 1 completada**: ✅ Routing automático implementado
2. **Fase 2 (Futuro)**: Integración con servicios de telemetría
3. **Fase 3 (Futuro)**: Soporte multimodal con imágenes
4. **Fase 4 (Futuro)**: Generación real de descargas y reportes
