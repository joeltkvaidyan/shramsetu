#!/bin/sh
set -e

# In production (Postgres), the recommended path is real Alembic
# migrations rather than relying on init_db()'s create-tables-if-missing
# fallback. Opt in by setting RUN_MIGRATIONS_ON_START=true (e.g. in your
# production docker-compose/environment) — left off by default so local
# dev/demo (SQLite, docker-compose up) keeps working with zero extra steps.
if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
    echo "Running Alembic migrations..."
    alembic upgrade head
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WEB_CONCURRENCY:-4}"
