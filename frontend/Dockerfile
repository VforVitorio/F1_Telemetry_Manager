# ============================================
# Stage 1: Build React component
# ============================================
FROM node:18-slim AS node-builder

WORKDIR /build

# Copy package.json from custom component
COPY frontend/components/streamlit_audio_viz/frontend/package.json ./

# Install Node dependencies (uses install if no package-lock.json)
RUN npm install

# Copy component source code
COPY frontend/components/streamlit_audio_viz/frontend/ ./

# Build React component
RUN npm run build

# ============================================
# Stage 2: Python app with Streamlit
# ============================================
FROM python:3.10-slim

WORKDIR /app

# Install uv (fast package manager)
RUN pip install --no-cache-dir uv

# Copy requirements
COPY frontend/requirements.txt .

# Install Python dependencies with uv
RUN uv pip install --system -r requirements.txt

# Copy all Python code
COPY frontend/ ./frontend/

# Copy compiled component from stage 1
COPY --from=node-builder /build/build /app/frontend/components/streamlit_audio_viz/frontend/build

EXPOSE 8501

CMD ["streamlit", "run", "frontend/app/main.py", "--server.port", "8501", "--server.address", "0.0.0.0"]
