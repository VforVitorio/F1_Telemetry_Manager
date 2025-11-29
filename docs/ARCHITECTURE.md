
# F1 Telemetry Manager - System Architecture

## 📋 Document Overview

This document describes the architectural design and technical decisions for the F1_Telemetry_Manager project. It outlines the system structure, design patterns, module organization, and integration strategies.

**Project Duration:** 5 weeks (v1.0 MVP) + 6 weeks (v1.1 Enhancements)

**Last Updated:** January 2025

**Current Version:** 1.1

---

## 🎯 Architectural Approach

### Primary Pattern: Layered Architecture + Feature-Based Organization

**Why this approach?**

* ✅ Perfect for 5-week timeline (avoids over-engineering)
* ✅ Scalable without unnecessary complexity
* ✅ Clear separation of responsibilities
* ✅ Easy to test and maintain
* ✅ Streamlit + FastAPI complement each other well in layers

---

## 📐 System Layers

The system is organized into five distinct layers:

### 1. Presentation Layer (Streamlit)

**Responsibility:** User Interface and User Interaction

* Renders all visual components
* Handles user events and inputs
* Manages session state
* Displays data visualizations
* Provides navigation between features

### 2. API Layer (FastAPI)

**Responsibility:** HTTP Endpoints and Request Handling

* Exposes RESTful endpoints
* Validates incoming requests
* Handles authentication/authorization
* Formats responses
* Routes requests to appropriate services

### 3. Service Layer (Business Logic)

**Responsibility:** Core Functionality

* Implements business rules
* Orchestrates operations between multiple components
* Processes and transforms data
* Manages external API integrations
* Handles complex calculations and analytics

### 4. Repository Layer (Data Access)

**Responsibility:** Database Operations

* Abstracts database interactions
* Provides CRUD operations
* Implements data persistence logic
* Manages queries and transactions
* Ensures data integrity

### 5. Database Layer (Supabase/PostgreSQL)

**Responsibility:** Data Persistence

* Stores user information
* Maintains chat history
* Caches session data
* Manages Grand Prix metadata
* Tracks download history

---

## 📁 Project Structure

### Complete Repository Structure

```
F1_Telemetry_Manager/
│
├── 📂 frontend/                    # Streamlit Application
│   ├── 📂 app/
│   │   ├── 📄 main.py             # Entry point (Landing page)
│   │   ├── 📄 dashboard.py        # Main dashboard
│   │   └── 📄 config.py           # Frontend config
│   │
│   ├── 📂 pages/                  # Streamlit pages
│   │   ├── 📄 1_🏎️_Advanced.py
│   │   ├── 📄 2_⚖️_Compare.py
│   │   ├── 📄 3_📥_Downloads.py
│   │   ├── 📄 4_📊_Reports.py
│   │   └── 📄 5_⚙️_Admin.py
│   │
│   ├── 📂 components/             # Reusable UI
│   │   ├── 📂 auth/
│   │   │   ├── 📄 login_form.py
│   │   │   └── 📄 register_form.py
│   │   ├── 📂 chatbot/
│   │   │   ├── 📄 chat_interface.py
│   │   │   ├── 📄 message_bubble.py
│   │   │   └── 📄 context_button.py
│   │   ├── 📂 telemetry/
│   │   │   ├── 📄 lap_graphs.py
│   │   │   ├── 📄 circuit_animation.py
│   │   │   ├── 📄 telemetry_tabs.py
│   │   │   └── 📄 data_selector.py
│   │   ├── 📂 comparison/
│   │   │   ├── 📄 compare_selector.py
│   │   │   └── 📄 delta_chart.py
│   │   └── 📂 common/
│   │       ├── 📄 navbar.py
│   │       ├── 📄 sidebar.py
│   │       ├── 📄 loading.py
│   │       └── 📄 error_display.py
│   │
│   ├── 📂 services/               # API clients
│   │   ├── 📄 api_client.py
│   │   ├── 📄 auth_service.py
│   │   ├── 📄 telemetry_service.py
│   │   ├── 📄 chatbot_service.py
│   │   ├── 📄 comparison_service.py
│   │   └── 📄 admin_service.py
│   │
│   ├── 📂 utils/
│   │   ├── 📄 session_manager.py
│   │   ├── 📄 formatters.py
│   │   ├── 📄 validators.py
│   │   └── 📄 chart_helpers.py
│   │
│   └── 📄 requirements.txt
│
├── 📂 backend/                    # FastAPI Application
│   ├── 📂 api/                    # HTTP Layer
│   │   ├── 📂 v1/
│   │   │   ├── 📄 __init__.py
│   │   │   ├── 📂 endpoints/
│   │   │   │   ├── 📄 auth.py
│   │   │   │   ├── 📄 telemetry.py
│   │   │   │   ├── 📄 chatbot.py
│   │   │   │   ├── 📄 comparison.py
│   │   │   │   ├── 📄 downloads.py
│   │   │   │   ├── 📄 reports.py
│   │   │   │   └── 📄 admin.py
│   │   │   └── 📄 router.py
│   │   └── 📄 deps.py            # Dependencies
│   │
│   ├── 📂 core/
│   │   ├── 📄 config.py
│   │   ├── 📄 security.py
│   │   └── 📄 database.py
│   │
│   ├── 📂 models/                # Pydantic DTOs
│   │   ├── 📄 user.py
│   │   ├── 📄 telemetry.py
│   │   ├── 📄 chat.py
│   │   ├── 📄 comparison.py
│   │   └── 📄 report.py
│   │
│   ├── 📂 schemas/               # DB Schemas
│   │   ├── 📄 user.py
│   │   ├── 📄 session_data.py
│   │   ├── 📄 chat_history.py
│   │   └── 📄 permission.py
│   │
│   ├── 📂 services/              # Business Logic
│   │   ├── 📂 auth/
│   │   │   ├── 📄 auth_service.py
│   │   │   └── 📄 permission_service.py
│   │   ├── 📂 telemetry/
│   │   │   ├── 📄 telemetry_service.py
│   │   │   ├── 📄 fastf1_adapter.py
│   │   │   └── 📄 data_processor.py
│   │   ├── 📂 chatbot/
│   │   │   ├── 📄 chatbot_service.py
│   │   │   ├── 📄 lm_studio_adapter.py
│   │   │   ├── 📄 context_manager.py
│   │   │   └── 📄 prompt_builder.py
│   │   ├── 📂 comparison/
│   │   │   ├── 📄 comparison_service.py
│   │   │   └── 📄 delta_calculator.py
│   │   ├── 📂 downloads/
│   │   │   ├── 📄 export_service.py
│   │   │   └── 📄 file_generator.py
│   │   ├── 📂 reports/
│   │   │   ├── 📄 report_service.py
│   │   │   └── 📄 report_generator.py
│   │   └── 📂 admin/
│   │       ├── 📄 user_management_service.py
│   │       └── 📄 gp_management_service.py
│   │
│   ├── 📂 repositories/          # Data Access
│   │   ├── 📄 base_repository.py
│   │   ├── 📄 user_repository.py
│   │   ├── 📄 chat_repository.py
│   │   ├── 📄 session_repository.py
│   │   └── 📄 permission_repository.py
│   │
│   ├── 📂 utils/
│   │   ├── 📄 logger.py
│   │   ├── 📄 exceptions.py
│   │   └── 📄 helpers.py
│   │
│   ├── 📄 main.py               # FastAPI entry
│   └── 📄 requirements.txt
│
├── 📂 shared/                   # Shared code
│   ├── 📂 constants/
│   │   ├── 📄 f1_constants.py
│   │   └── 📄 permissions.py
│   ├── 📂 types/
│   │   └── 📄 common_types.py
│   └── 📂 utils/
│       └── 📄 date_helpers.py
│
├── 📂 tests/
│   ├── 📂 unit/
│   │   ├── 📂 backend/
│   │   │   ├── 📄 test_services.py
│   │   │   └── 📄 test_repositories.py
│   │   └── 📂 frontend/
│   │       └── 📄 test_components.py
│   └── 📂 integration/
│       └── 📄 test_api_endpoints.py
│
├── 📂 docs/
│   ├── 📄 API.md
│   ├── 📄 ARCHITECTURE.md
│   ├── 📄 ROADMAP.md
│   ├── 📄 CHANGELOG.md
│   └── 📄 ISSUE_TEMPLATES.md
│
├── 📄 .env.example
├── 📄 .gitignore
├── 📄 docker-compose.yml
├── 📄 LICENSE
└── 📄 README.md
```

### Key File Responsibilities

**Frontend:**

* `app/main.py`: Landing page, app entry
* `app/dashboard.py`: Main telemetry dashboard
* `pages/*.py`: Feature pages (Streamlit convention)
* `components/`: Reusable UI by feature
* `services/`: HTTP clients for backend
* `utils/`: UI helpers

**Backend:**

* `main.py`: FastAPI initialization
* `api/v1/endpoints/*.py`: Route handlers
* `api/deps.py`: Dependency injection
* `core/`: Config, security, database
* `models/`: Request/response DTOs
* `schemas/`: Database tables
* `services/`: Business logic
* `repositories/`: CRUD operations

**Shared:**

* Constants, types, utilities used by both frontend and backend

---

## 🔄 Data Flow Architecture

### Standard Request Flow

**User Action → API Client → API Endpoint → Service → Repository → Database**

### Example: Fetching Telemetry Data

1. **User Action:** User selects year, GP, session, and driver in UI
2. **API Client:** Frontend telemetry service makes HTTP request to FastAPI
3. **API Endpoint:** Controller validates request and checks authentication
4. **Service Layer:**
   * Telemetry service orchestrates the operation
   * Calls FastF1 adapter to fetch external data
   * Data processor transforms raw data
   * May save to database via repository for caching
5. **Repository Layer:** Performs database operations if needed
6. **Response:** Processed data flows back through layers to frontend
7. **Presentation:** Frontend receives data and renders visualizations

---

## 🧩 Feature Modules

The application is organized into seven primary feature modules:

### 1. Authentication Module

**Core Responsibilities:**

* User registration and login
* JWT token generation and validation
* Permission management (feature-based, not role-based)
* Session handling

**Key Components:**

* Frontend: Login form, register form, auth service
* Backend: Auth endpoints, auth service, permission service, user repository, security utilities

**Key Operations:**

* Register new user with email/password
* Authenticate user and issue JWT token
* Validate token on protected endpoints
* Check user permissions for specific features

---

### 2. Telemetry Module

**Core Responsibilities:**

* Fetch data from FastF1 API
* Process and transform telemetry data
* Generate visualizations (lap graphs, circuit animations)
* Manage data selectors (Year, GP, Session, Drivers)

**Key Components:**

* Frontend: Lap graphs, circuit animation, telemetry tabs, data selector
* Backend: Telemetry endpoints, telemetry service, FastF1 adapter, data processor, session repository

**Key Operations:**

* Retrieve session data for specific GP
* Extract lap telemetry for individual drivers
* Process raw telemetry into usable format
* Calculate lap times and statistics
* Cache frequently accessed sessions

---

### 3. Chatbot Module (Caronte)

**Core Responsibilities:**

* Manage conversational AI interface
* Integrate with LM Studio for LLM responses (local inference)
* Maintain conversation context with smart compression
* Generate contextual responses based on visualizations
* Support multimodal queries (text + images)
* Save and retrieve chat history efficiently

**Key Components:**

* Frontend: Chat interface, message bubbles, context buttons ("Ask about this"), auto-send system
* Backend: Chatbot endpoints, LM Studio service, query router (5 handlers), context manager, prompt builder, chat repository

**Key Operations:**

* Process user messages with F1 session context
* Build appropriate prompts based on conversation state
* Call LM Studio API for LLM responses (with timeout configuration)
* Attach visualization context and images to queries
* Store conversation history per user with automatic compression
* Route queries to specialized handlers (basic, technical, comparison, report, download)
* Support vision models (Qwen3-VL) for chart analysis

**Advanced Features (v1.1):**

* **Smart History Compression**: Automatic LLM-powered summarization after 5 interactions
* **Vision Model Support**: Send telemetry charts directly to multimodal models
* **Auto-send from Dashboard**: Click 🤖 on any chart to analyze in chat automatically
* **Infinite Timeout**: Vision queries process without time limits (DEFAULT_TIMEOUT=None)
* **Automatic Retry**: Falls back to text-only if vision model fails
* **Image Optimization**: Charts converted to 768×480 JPEG at 85% quality
* **Data URI Encoding**: Base64 format compatible with OpenAI Vision API

**Chat Management Strategy:**

```
Chat History Flow:
1. User sends message → Added to history
2. History length checked → If >5 interactions, compress
3. Compression: LLM summarizes old messages → Keep recent 5
4. New message built with compressed context
5. Send to LM Studio with optimized payload
```

**Vision Model Flow:**

```
Multimodal Query Flow:
1. User clicks 🤖 on chart → Chart to 768×480 JPEG
2. Convert to base64 data URI
3. Navigate to chat with pending message
4. Auto-send with image_base64 parameter
5. Build multimodal message (text + image parts)
6. Send to LM Studio (timeout=None)
7. If vision fails → Retry without image
8. Return analysis response
```

---

### 4. Comparison Module

**Core Responsibilities:**

* Enable multi-driver/lap comparisons
* Calculate performance deltas
* Generate side-by-side visualizations
* Analyze sector-level differences

**Key Components:**

* Frontend: Comparison page, compare selector, delta charts
* Backend: Comparison endpoints, comparison service, delta calculator

**Key Operations:**

* Compare telemetry between two or more drivers
* Calculate time deltas across entire laps
* Compare sector performance
* Generate comparative visualizations

---

### 5. Downloads Module

**Core Responsibilities:**

* Export datasets in CSV format
* Browse available datasets with filters
* Preview data before download
* Track download history

**Key Components:**

* Frontend: Downloads page
* Backend: Downloads endpoints, export service, file generator

**Key Operations:**

* List available datasets with filters (Year, GP, Session, Type)
* Generate CSV files from session data
* Provide data preview (first N rows)
* Track user download history

---

### 6. Reports Module

**Core Responsibilities:**

* Generate text-based reports from conversations
* Export chat history
* (Future: PDF generation with templates)

**Key Components:**

* Frontend: Reports page
* Backend: Reports endpoints, report service, report generator

**Key Operations:**

* Generate text/markdown report from chat conversation
* Export conversation history
* Create shareable links (optional)
* (V2.0: Generate PDF reports with custom templates)

---

### 7. Admin Module

**Core Responsibilities:**

* User management (CRUD operations)
* Grand Prix management
* System configuration
* Permission assignment

**Key Components:**

* Frontend: Admin dashboard page
* Backend: Admin endpoints, user management service, GP management service, user repository

**Key Operations:**

* List all users with filtering
* Update user permissions (feature flags)
* Manage GP metadata (add, edit, delete)
* View system statistics
* (Future: Data import wizard)

---

## 🔐 Security Architecture

### Authentication Flow

1. **User Login:** User submits credentials through frontend
2. **Token Generation:** Backend validates credentials and generates JWT token
3. **Token Storage:** Frontend stores token in Streamlit session state
4. **Protected Requests:** Every API request includes token in Authorization header
5. **Token Validation:** Backend middleware validates token and extracts user
6. **Permission Check:** System checks user's feature flags before allowing access

### Permission System (Feature-Based, Not Role-Based)

**User Permission Flags:**

* `can_download`: Ability to export datasets
* `can_compare`: Access to comparison features
* `can_generate_reports`: Ability to create reports
* `can_admin`: Admin panel access

**Key Principle:** Users are not assigned fixed roles. Instead, they have individual feature permissions that can be granted/revoked independently.

---

## 🗄️ Database Schema

### Primary Tables

**users**

* Stores user credentials (hashed passwords)
* Contains feature permission flags
* Tracks account metadata (creation date, active status)

**chat_history**

* Stores user conversations with Caronte
* Includes message, response, and context (JSONB)
* Enables conversation replay and analysis

**session_cache** (Optional Performance Optimization)

* Caches FastF1 API responses
* Reduces external API calls
* Stores session data as JSONB

**grand_prix**

* Contains metadata for all F1 Grand Prix
* Used for data selectors and admin management
* Includes year, round, country, location, date

**download_history** (Optional)

* Tracks user download activity
* Useful for analytics and debugging

---

## 🔌 External Service Integrations

### 1. LM Studio (Local LLM)

**Purpose:** Provides conversational AI capabilities for Caronte chatbot

**Integration Approach:**

* Adapter pattern isolates LM Studio specifics
* HTTP client communicates with local API endpoint
* Prompt building happens in service layer
* Responses are processed before sending to frontend

**Configuration:**

* Default: `http://localhost:1234`
* Requires LM Studio running locally during development
* Production: Consider self-hosted LLM server or alternative API

---

### 2. FastF1 API

**Purpose:** Fetches Formula 1 telemetry and session data

**Integration Approach:**

* Adapter pattern wraps FastF1 library
* Service layer orchestrates data fetching
* Data processor transforms raw FastF1 data into application format
* Optional caching layer to avoid repeated API calls

**Data Availability:**

* Historical F1 data (multiple years)
* Session types: Practice, Qualifying, Sprint, Race
* Telemetry metrics: Speed, throttle, brake, RPM, gear, DRS, etc.

---

### 3. Supabase (PostgreSQL Database)

**Purpose:** Persistent data storage for users, chats, and caches

**Integration Approach:**

* Supabase client initialized in core configuration
* Repository layer abstracts database operations
* JSONB columns for flexible data storage (context, session data)
* Row-level security can be enabled for additional protection

**Connection Management:**

* Connection pooling handled by Supabase client
* Environment variables for credentials
* Dependency injection for database client

---

## 🎨 Design Principles Applied

### 1. Single Responsibility Principle (Unifunctionality)

Each function/class has one clear responsibility:

* Functions should do one thing and do it well
* Large operations are composed of smaller, focused functions
* Avoid trivial helper functions that add noise

**Example Application:**

* Fetching data is separate from processing data
* Processing data is separate from displaying data
* Each layer handles only its designated responsibility

---

### 2. Separation of Concerns

Each layer operates independently:

* **Presentation:** Only UI and event handling
* **API:** Only routing and request validation
* **Service:** Only business logic
* **Repository:** Only data access

**Benefits:**

* Easy to modify one layer without affecting others
* Clear boundaries make testing straightforward
* Team members can work on different layers simultaneously

---

### 3. Dependency Injection

Dependencies are injected rather than created:

* Database clients injected into repositories
* Repositories injected into services
* Services injected into API endpoints
* External API clients injected into adapters

**Benefits:**

* Easier to test (can inject mocks)
* Loose coupling between components
* Configuration managed centrally

---

### 4. Repository Pattern

Data access is abstracted through repositories:

* Base repository provides common CRUD operations
* Feature-specific repositories extend base repository
* Business logic never directly queries database
* Repositories return domain objects, not database rows

**Benefits:**

* Database can be swapped without changing business logic
* Queries are centralized and reusable
* Testing can use in-memory repositories

---

### 5. Adapter Pattern for External APIs

External services are wrapped in adapters:

* FastF1 adapter isolates FastF1 library specifics
* LM Studio adapter encapsulates LLM API calls
* Business logic depends on adapter interfaces, not implementations

**Benefits:**

* External APIs can be replaced without changing core logic
* Mocking external services for testing is straightforward
* API-specific error handling is isolated

---

## 📊 System Architecture Diagram

```
┌─────────────────────────────────────────┐
│         USER BROWSER                    │
└─────────────┬───────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────┐
│   STREAMLIT FRONTEND                    │
│   (Presentation Layer)                  │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  Pages (Feature-based)          │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  Components (Reusable UI)       │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  Services (API Client)          │   │
│   └─────────────────────────────────┘   │
└─────────────┬───────────────────────────┘
              │ HTTP Requests
              ↓
┌─────────────────────────────────────────┐
│   FASTAPI BACKEND                       │
│   (API + Service + Repository Layers)  │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  Endpoints (Controllers)        │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  Services (Business Logic)      │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  Repositories (Data Access)     │   │
│   └─────────────────────────────────┘   │
└───────┬─────────────────────┬───────────┘
        │                     │
        ↓                     ↓
┌──────────────┐    ┌────────────────────┐
│  SUPABASE    │    │  EXTERNAL APIs     │
│  (PostgreSQL)│    │                    │
│              │    │  • FastF1          │
│  Tables:     │    │  • LM Studio       │
│  • users     │    │                    │
│  • chat      │    └────────────────────┘
│  • cache     │
│  • gp        │
└──────────────┘
```

---

## 🚀 Deployment Architecture

### Development Environment

* **Streamlit:** `http://localhost:8501`
* **FastAPI:** `http://localhost:8000`
* **LM Studio:** `http://localhost:1234`
* **Supabase:** Cloud-hosted (supabase.co)

### Production Environment (MVP)

* **Frontend:** Streamlit Cloud (free tier)
* **Backend:** Railway / Render / Fly.io (free or low-cost tier)
* **Database:** Supabase (cloud-hosted, free tier available)
* **LLM:** Self-hosted server or alternative API

**Important Note:** LM Studio is for local development only. Production requires either:

1. Self-hosted LLM server with GPU
2. Commercial API (OpenAI, Anthropic Claude, etc.)
3. Open-source alternative (Ollama on self-hosted server)

---

## 🧪 Testing Strategy

### Testing Levels

**1. Unit Tests**

* Test individual functions in isolation
* Mock external dependencies
* Focus on business logic correctness
* Target: Service layer and utility functions

**2. Integration Tests**

* Test API endpoints end-to-end
* Use test database or in-memory DB
* Verify layer interactions
* Target: Complete feature workflows

**3. End-to-End Tests (Optional for MVP)**

* Test complete user flows through UI
* Requires more setup time
* Recommended for post-MVP polish

### Testing Scope for 5-Week Timeline

**Priority Testing:**

* ✅ Unit tests for core service functions
* ✅ Integration tests for critical API endpoints (auth, telemetry, chatbot)
* ✅ Manual testing of UI flows

**Deferred to V2.0:**

* ❌ Comprehensive E2E test suite
* ❌ Load/performance testing
* ❌ Security penetration testing

---

## 📦 Technology Stack

### Frontend Technologies

* **Framework:** Streamlit 1.31+
* **Visualization:** Plotly 5.18+
* **Data Processing:** Pandas 2.1+, NumPy 1.26+
* **HTTP Client:** httpx 0.26+
* **UI Enhancements:** streamlit-extras 0.3+

### Backend Technologies

* **Framework:** FastAPI 0.109+
* **Server:** Uvicorn 0.27+
* **Data Validation:** Pydantic 2.5+
* **Authentication:** python-jose 3.3+ (JWT), passlib 1.7+ (password hashing)
* **Database Client:** supabase 2.3+
* **F1 Data:** fastf1 3.2+
* **Data Processing:** Pandas 2.1+, NumPy 1.26+

### Database

* **Primary:** Supabase (PostgreSQL-based)
* **Features Used:** User authentication, JSONB columns, row-level security (optional)

### External Services

* **LLM:** LM Studio (local development)
* **F1 Data:** FastF1 API (Python library)

---

## ⚡ Architectural Decisions Summary

| Decision                      | Chosen Approach           | Rationale                                               |
| ----------------------------- | ------------------------- | ------------------------------------------------------- |
| **Primary Pattern**     | Layered Architecture      | Clear separation, easy maintenance                      |
| **Module Organization** | Feature-based             | Scalable, modular, intuitive                            |
| **Data Access**         | Repository Pattern        | Database abstraction, testable                          |
| **API Design**          | RESTful with FastAPI      | Industry standard, well-documented, auto-generated docs |
| **Frontend State**      | Streamlit session_state   | Native solution, simple to use                          |
| **Authentication**      | JWT tokens                | Stateless, scalable, industry standard                  |
| **Permissions**         | Feature flags (no roles)  | Flexible as required by design specs                    |
| **External APIs**       | Adapter pattern           | Decoupled, easily replaceable                           |
| **Testing Approach**    | Unit + Integration        | Balance between quality and development time            |
| **Deployment**          | Separate frontend/backend | Scalable, follows modern practices                      |

---

## 🎯 MVP Scope (5 Weeks)

### Features Included in MVP

**Core Functionality:**

* ✅ User authentication (register, login, logout)
* ✅ Dashboard with data selectors (Year, GP, Session, Drivers)
* ✅ Basic visualizations (Lap Graphs, Circuit Animation, Telemetry Tabs)
* ✅ Text-based chatbot (Caronte) with contextual "Ask about this" buttons
* ✅ Basic comparison mode (2 drivers, side-by-side)
* ✅ CSV downloads with preview
* ✅ Basic admin panel (user/GP management)
* ✅ Simple text/markdown reports from chat
* ✅ Complete navigation between all pages
* ✅ Basic responsive design

### Features Deferred to V2.0

**Advanced Functionality (Post-MVP):**

* ❌ Voice input/output (Speech-to-Text, Text-to-Speech)
* ❌ Complex PDF reports with templates
* ❌ Circuit Domination visualization
* ❌ Quick Actions Panel
* ❌ Grid view for telemetry
* ❌ Multi-level comparisons (3+ drivers)
* ❌ Keyboard shortcuts
* ❌ Advanced analytics dashboard
* ❌ JSON downloads
* ❌ Download history tracking
* ❌ Custom report templates
* ❌ Data import wizard
* ❌ Full accessibility compliance (ARIA)

---

## 📅 Implementation Checklist by Module

### Week 1: Setup + Authentication

* [ ] Project structure setup
* [ ] FastAPI configuration with CORS
* [ ] Streamlit multi-page setup
* [ ] Supabase connection
* [ ] Base repository implementation
* [ ] User repository
* [ ] Auth endpoints (register, login)
* [ ] JWT token system
* [ ] Frontend auth forms
* [ ] Session management

### Week 2: Telemetry Module

* [ ] FastF1 adapter
* [ ] Data processing service
* [ ] Telemetry endpoints
* [ ] Session cache repository
* [ ] Data selector component
* [ ] Lap graphs component
* [ ] Telemetry tabs component
* [ ] Circuit animation component

### Week 3: Chatbot Module

* [ ] LM Studio adapter
* [ ] Context manager
* [ ] Prompt builder
* [ ] Chat repository
* [ ] Chatbot endpoints
* [ ] Chat interface component
* [ ] Context buttons ("Ask about this")
* [ ] Message bubble components

### Week 4: Comparison + Downloads

* [ ] Comparison service
* [ ] Delta calculator
* [ ] Comparison endpoints
* [ ] Comparison page
* [ ] Compare selector component
* [ ] Export service
* [ ] CSV file generator
* [ ] Downloads endpoints
* [ ] Downloads page

### Week 5: Reports + Admin + Polish

* [ ] Report generator (text/markdown)
* [ ] Report endpoints
* [ ] Reports page
* [ ] User management service
* [ ] GP management service
* [ ] Admin endpoints
* [ ] Admin page
* [ ] Comprehensive testing
* [ ] Bug fixing
* [ ] Deployment

---

## 🔍 Key Implementation Considerations

### Modularity

* Each feature should be self-contained
* Shared utilities should be truly generic
* Avoid tight coupling between features

### Scalability

* Database queries should be optimized (indexes, pagination)
* Consider caching for frequently accessed data
* API responses should be paginated when returning lists

### Maintainability

* Document complex business logic
* Use consistent naming conventions
* Keep functions small and focused
* Write meaningful commit messages

### User Experience

* All operations should have loading states
* Error messages should be clear and actionable
* Navigation should be intuitive
* Provide helpful tooltips and documentation links

### Security

* Never expose sensitive information in frontend
* Validate all user inputs on backend
* Use parameterized queries (Supabase handles this)
* Implement rate limiting for sensitive endpoints (optional for MVP)

---

## 📝 Documentation Standards

### Code Documentation

* All public functions should have docstrings
* Complex algorithms should have inline comments
* Configuration files should explain each setting

### API Documentation

* FastAPI auto-generates OpenAPI docs at `/docs`
* Endpoints should have clear descriptions
* Request/response models should be documented

### User Documentation

* README should explain how to run the project
* CHANGELOG should track all significant changes
* This ARCHITECTURE document explains system design
* ROADMAP tracks planned features

---

## 📚 References and Further Reading

**Design Patterns:**

* Repository Pattern: [Martin Fowler](https://martinfowler.com/eaaCatalog/repository.html)
* Layered Architecture: [Microsoft Architecture Guide](https://docs.microsoft.com/en-us/azure/architecture/guide/architecture-styles/n-tier)

**Technologies:**

* [Streamlit Documentation](https://docs.streamlit.io/)
* [FastAPI Documentation](https://fastapi.tiangolo.com/)
* [Supabase Documentation](https://supabase.com/docs)
* [FastF1 Documentation](https://theoehrly.github.io/Fast-F1/)

**Best Practices:**

* [12 Factor App](https://12factor.net/)
* [RESTful API Design](https://restfulapi.net/)
* [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**Document Version:** 1.1

**Last Updated:** January 2025

**Status:** Production (v1.1 Complete)
