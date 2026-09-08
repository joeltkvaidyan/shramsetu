FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2, Pillow, sentence-transformers/torch
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads rag/index
RUN chmod +x entrypoint.sh

# Run as a non-root user in production rather than as root inside the
# container — standard hardening, costs nothing.
RUN groupadd -r shramsetu && useradd -r -g shramsetu shramsetu \
    && chown -R shramsetu:shramsetu /app
USER shramsetu

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Multiple workers for production throughput. Override WEB_CONCURRENCY at
# deploy time to match your host's CPU count (e.g. 2 * cores + 1).
ENV WEB_CONCURRENCY=4
CMD ["./entrypoint.sh"]
