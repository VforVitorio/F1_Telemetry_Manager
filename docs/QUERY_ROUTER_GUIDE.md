# 🎯 F1 Query Router - Guía Completa

## 📋 Resumen Ejecutivo

El **F1 Query Router** es un sistema inteligente de enrutamiento de consultas que clasifica automáticamente las preguntas de los usuarios y las dirige al handler especializado apropiado, garantizando respuestas optimizadas y contextualizadas.

## 🏗️ Arquitectura del Sistema

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

## 🎯 Tipos de Consultas Soportadas

### 1. BASIC QUERY - Consultas Básicas ℹ️

**Descripción**: Preguntas simples sobre conceptos F1, terminología, reglas e información general.

**Ejemplos**:
- "¿Qué es DRS?"
- "Explica el sistema de puntos en F1"
- "¿Quién ganó el GP de Mónaco en 2023?"
- "¿Qué son los compuestos de neumáticos?"
- "Explica qué es la pole position"

**Características del Handler**:
- Respuestas educativas y accesibles
- Adaptado a diferentes niveles de conocimiento (principiantes a expertos)
- Enfoque en claridad y comprensión
- Sin requerir datos de telemetría

**System Prompt**: [basic_query_prompt.md](../backend/services/chatbot/prompts/basic_query_prompt.md)

---

### 2. TECHNICAL QUERY - Consultas Técnicas 🔧

**Descripción**: Análisis técnico avanzado que requiere datos de telemetría, métricas de rendimiento y análisis de ingeniería.

**Ejemplos**:
- "Muestra la aplicación de aceleración en el sector 2"
- "Analiza los datos de presión de freno en la vuelta 15"
- "¿Cuál fue la velocidad máxima en la recta?"
- "Muestra las curvas de RPM para la vuelta más rápida"
- "Explica el patrón de degradación de neumáticos"

**Características del Handler**:
- Análisis de telemetría detallado
- Insights de ingeniería de carreras
- Explicaciones técnicas con terminología profesional
- Recomendaciones de optimización de rendimiento

**Canales de Telemetría Analizados**:
- Velocidad (km/h)
- Acelerador (0-100%)
- Freno (0-100%)
- RPM
- Marchas (1-8)
- DRS (activación)
- Fuerzas G (lateral y longitudinal)
- Temperaturas de neumáticos

**System Prompt**: [technical_query_prompt.md](../backend/services/chatbot/prompts/technical_query_prompt.md)

---

### 3. COMPARISON QUERY - Consultas Comparativas ⚖️

**Descripción**: Comparaciones multi-piloto o multi-vuelta con análisis estadístico y deltas de rendimiento.

**Ejemplos**:
- "Compara los tiempos de vuelta de Hamilton vs Verstappen"
- "Muestra el delta entre sus vueltas más rápidas"
- "¿Quién fue más rápido en el sector 1, Leclerc o Sainz?"
- "Compara el ritmo de carrera de los top 3 pilotos"
- "Analiza la brecha de rendimiento entre compañeros de equipo"

**Características del Handler**:
- Análisis lado a lado
- Cálculo de deltas (tiempo, velocidad, porcentaje)
- Análisis sector por sector
- Insights estadísticos y de significancia
- Comparaciones objetivas basadas en datos

**Tipos de Comparación**:
- Piloto vs Piloto
- Vuelta vs Vuelta
- Sesión vs Sesión
- Compañeros de equipo
- Año vs Año

**System Prompt**: [comparison_query_prompt.md](../backend/services/chatbot/prompts/comparison_query_prompt.md)

---

### 4. REPORT REQUEST - Solicitud de Reporte 📄

**Descripción**: Generación de resúmenes y reportes profesionales de conversaciones y análisis previos.

**Ejemplos**:
- "Genera un resumen de nuestra conversación"
- "Crea un reporte del análisis que hicimos"
- "Exporta esta conversación como documento"
- "Resume los hallazgos clave"
- "Haz un reporte PDF de este chat"

**Características del Handler**:
- Consolidación de conversaciones multi-turno
- Estructura profesional (Executive Summary, Findings, Conclusions)
- Formato Markdown para fácil exportación
- Preservación de precisión técnica
- Extracción de insights clave

**Estructura de Reporte**:
1. **Executive Summary**: Resumen de 2-3 oraciones
2. **Topics Discussed**: Temas principales cubiertos
3. **Key Findings**: Hallazgos principales
4. **Detailed Analysis**: Análisis técnico detallado
5. **Technical Details**: Datos y métricas específicas
6. **Conclusions**: Resumen final y recomendaciones

**System Prompt**: [report_handler_prompt.md](../backend/services/chatbot/prompts/report_handler_prompt.md)

---

### 5. DOWNLOAD REQUEST - Solicitud de Descarga 💾

**Descripción**: Exportación de datos de telemetría, resultados de análisis y datos de carreras en varios formatos.

**Ejemplos**:
- "Descarga los datos de telemetría como CSV"
- "Exporta a JSON"
- "¿Puedo obtener esto en formato Excel?"
- "Descarga la tabla de tiempos de vuelta"
- "Exporta todos los datos que analizamos"

**Formatos Soportados**:
- **CSV**: Para Excel, hojas de cálculo, análisis general
- **JSON**: Para aplicaciones web, APIs, uso programático
- **Excel (XLSX)**: Para reportes profesionales, múltiples hojas
- **Parquet**: Para big data, ciencia de datos (Pandas, Spark)

**Características del Handler**:
- Detección automática de formato
- Guía sobre el mejor formato para cada uso
- Descripción de estructura de datos
- Recomendaciones de uso

**System Prompt**: [download_handler_prompt.md](../backend/services/chatbot/prompts/download_handler_prompt.md)

---

## 🧠 Sistema de Clasificación

### Clasificación LLM (Principal)

El sistema utiliza un LLM (via LM Studio) para clasificar consultas con alta precisión:

- **Temperature**: 0.1 (baja para consistencia)
- **Max Tokens**: 50 (respuesta corta esperada)
- **System Prompt**: [classifier_system_prompt.md](../backend/services/chatbot/prompts/classifier_system_prompt.md)

### Clasificación Rule-based (Fallback)

Si LM Studio no está disponible, el sistema usa un clasificador basado en reglas:

```python
# Palabras clave para DOWNLOAD_REQUEST
download_keywords = ['download', 'export', 'csv', 'json', 'excel', 'xlsx']

# Palabras clave para REPORT_REQUEST
report_keywords = ['report', 'summary', 'summarize', 'document', 'pdf']

# Palabras clave para COMPARISON_QUERY
comparison_keywords = ['compare', 'versus', 'vs', 'vs.', 'difference between', 'delta']

# Palabras clave para TECHNICAL_QUERY
technical_keywords = [
    'telemetry', 'speed', 'throttle', 'brake', 'rpm', 'gear',
    'temperature', 'tire', 'tyre', 'sector', 'lap time', 'data'
]

# Default: BASIC_QUERY
```

## 📡 API Endpoint

### POST `/api/v1/chat/query`

**Request Structure**:
```json
{
  "text": "Tu pregunta aquí",
  "image": null,
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

**Response Structure**:
```json
{
  "type": "COMPARISON_QUERY",
  "handler": "ComparisonQueryHandler",
  "response": "Respuesta del LLM...",
  "metadata": {
    "query_type": "COMPARISON_QUERY",
    "handler": "ComparisonQueryHandler",
    "processing_time_ms": 1234.56,
    "timestamp": "2024-11-28T12:00:00",
    "llm_model": "qwen2-vl-4b-instruct",
    "tokens_used": 150
  }
}
```

## 🧪 Testing

### Ejecutar Tests

```bash
# Test completo (con LM Studio)
python3 backend/test_query_router.py

# Test solo estructura y fallback (sin LM Studio)
python3 backend/test_query_router.py <<< "n"
```

### Casos de Test

El sistema incluye test cases para validar la clasificación:

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

## 📊 Métricas y Performance

El router proporciona métricas detalladas en cada respuesta:

- **processing_time_ms**: Tiempo total de procesamiento
- **tokens_used**: Tokens consumidos del LLM
- **handler_type**: Tipo de handler ejecutado
- **used_context**: Si se usó contexto F1
- **used_history**: Si se usó historial de chat
- **used_image**: Si se procesó una imagen

## 🔄 Flujo de Procesamiento

1. **Recepción de Query**: Usuario envía consulta via API
2. **Validación**: Validar campos requeridos (`text`)
3. **Clasificación**: LLM o fallback determina el tipo
4. **Enrutamiento**: Router selecciona el handler apropiado
5. **Procesamiento**: Handler especializado genera respuesta
6. **Respuesta**: Retornar resultado con metadata

## 🎨 System Prompts

Todos los prompts están centralizados en archivos Markdown para fácil mantenimiento:

```
backend/services/chatbot/prompts/
├── basic_query_prompt.md           # Prompt para consultas básicas
├── technical_query_prompt.md       # Prompt para análisis técnico
├── comparison_query_prompt.md      # Prompt para comparaciones
├── report_handler_prompt.md        # Prompt para reportes
├── download_handler_prompt.md      # Prompt para descargas
└── classifier_system_prompt.md     # Prompt del clasificador
```

### Ventajas de Prompts en Archivos

✅ **Fácil edición**: Modificar sin tocar código
✅ **Versionamiento**: Control de cambios en Git
✅ **Colaboración**: Equipo puede mejorar prompts
✅ **Testing**: A/B testing de diferentes versiones
✅ **Documentación**: Prompts autodocumentados
✅ **Fallback**: Sistema incluye prompts mínimos de respaldo

## 🚀 Próximos Pasos

### Fase 2: Integración con Telemetría
- Conectar handlers con servicios de telemetría reales
- Obtener datos de FastF1 automáticamente
- Procesamiento de datos en tiempo real

### Fase 3: Soporte Multimodal
- Análisis de imágenes de telemetría
- Interpretación de gráficos
- OCR para datos de pantallas

### Fase 4: Funcionalidad Completa
- Generación real de archivos descargables
- Exportación a PDF de reportes
- Links de descarga con expiración

## 📚 Recursos Adicionales

- **Testing Guide**: [TEST_ROUTER.md](../backend/services/chatbot/TEST_ROUTER.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Roadmap**: [ROADMAP.md](ROADMAP.md)

## 🐛 Troubleshooting

### Error: LM Studio no conecta
**Solución**:
1. Verificar que LM Studio esté corriendo en `localhost:1234`
2. Iniciar el servidor en LM Studio
3. Cargar un modelo compatible

### Error: Clasificación incorrecta
**Solución**:
1. Revisar el prompt del clasificador
2. Ajustar palabras clave del fallback
3. Proporcionar más contexto en la query

### Error: Handler no encontrado
**Solución**:
1. Verificar que todos los handlers estén inicializados
2. Ejecutar test de estructura del router
3. Revisar imports en `__init__.py`

## 💡 Best Practices

### Para Usuarios
1. **Se específico**: Incluye contexto (año, GP, sesión)
2. **Una intención por query**: No mezcles tipos de consulta
3. **Usa palabras clave**: Facilita la clasificación correcta

### Para Desarrolladores
1. **Mantén prompts actualizados**: Refleja cambios en F1
2. **Versiona prompts**: Guarda cambios importantes
3. **Test exhaustivo**: Valida clasificación con casos edge
4. **Logs detallados**: Facilita debugging

## 📝 Changelog

### v1.0.0 - Sistema de Enrutamiento Completo
- ✅ 5 handlers especializados implementados
- ✅ Clasificador LLM + fallback rule-based
- ✅ Prompts profesionales en archivos .md
- ✅ Sistema de testing integrado
- ✅ Documentación completa
- ✅ Metadata y métricas de performance

---

**Desarrollado para**: F1 Telemetry Manager
**Fecha**: Noviembre 2025
**Versión**: 1.0.0
