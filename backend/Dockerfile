FROM python:3.10-slim

WORKDIR /app

# Install uv (fast package manager)
RUN pip install --no-cache-dir uv

COPY backend/requirements.txt .

# Install dependencies with uv (much faster than pip)
RUN uv pip install --system -r requirements.txt

COPY backend/ ./backend/

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
