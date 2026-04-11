# FL Research Monitor — Backend image
#
# Multi-stage build:
#   - builder: compiles Python wheels with build toolchain
#   - runtime: slim image with only runtime libs + TeX Live (pdflatex) + WeasyPrint system deps
#
# Runtime data lives OUTSIDE the image in a bind-mounted ./data-docker/ volume.

# ---------- Stage 1: builder ----------
FROM python:3.12-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --upgrade pip wheel \
 && pip wheel --wheel-dir=/wheels -r requirements.txt

# ---------- Stage 2: runtime ----------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_HOME=/app \
    DATA_DIR=/app/data

# System dependencies:
#   - pdflatex (report generation primary path): texlive-latex-base + recommended + extra + lmodern
#   - WeasyPrint (HTML→PDF fallback): pango, harfbuzz, gdk-pixbuf
#   - curl: healthcheck
#   - tini: clean PID 1 signal handling
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    curl \
    ca-certificates \
    fonts-liberation \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libgdk-pixbuf-2.0-0 \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    lmodern \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install prebuilt wheels from builder stage
COPY --from=builder /wheels /wheels
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-index --find-links=/wheels -r /tmp/requirements.txt \
 && rm -rf /wheels /tmp/requirements.txt

# Non-root user
RUN useradd --create-home --uid 1000 appuser
WORKDIR ${APP_HOME}

# Copy application code (excluded dirs handled by .dockerignore).
# Note: backend/alembic/ exists locally but is empty and not used at runtime
# (tables created via Base.metadata.create_all in lifespan), so not copied here.
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser backend/pyproject.toml ./pyproject.toml
COPY --chown=appuser:appuser backend/scripts ./scripts

# Create data mount point (runtime volume will be bind-mounted here)
RUN mkdir -p ${DATA_DIR} && chown -R appuser:appuser ${DATA_DIR}

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
