# PBI-005: backend image for Coolify (kcb.ma server).
# Build context: backend/ directory.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1

RUN pip install --no-cache-dir uv

WORKDIR /app

# Source first: `uv sync` builds the project itself (hatchling needs
# app/ present), so split-layer caching is traded for correctness.
# uv.lock is committed (PBI-001); --locked fails the build on drift.
COPY . .
RUN uv sync --locked --no-dev

# Runtime state (projects, runs.db, settings, indices) lives on the
# persistent volume mounted at /data/lab-projects — never in the image.
ENV LAB_PROJECTS_ROOT=/data/lab-projects

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/lab-projects')"

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
