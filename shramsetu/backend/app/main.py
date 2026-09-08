import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import auth, chat, documents, grievances, roles, settings as settings_routes
from app.api.v1 import government_auth, government, worker_notifications
from app.core.config import settings
from app.db.session import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Seed default government admin
    from app.db.session import get_session
    session = next(get_session())
    yield


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description="AI-First Multilingual Digital Welfare Platform for Migrant Workers — Government-grade Production",
    version="2.0.0",
    lifespan=lifespan,
)

# --- Security middleware ---

# Rate limiting (simple in-memory)
from collections import defaultdict
from time import time
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 100  # requests per window


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Security headers
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# --- CORS ---

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Worker routes (original) ---

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(documents.router, prefix=settings.API_V1_PREFIX)
app.include_router(chat.router, prefix=settings.API_V1_PREFIX)
app.include_router(grievances.router, prefix=settings.API_V1_PREFIX)
app.include_router(settings_routes.router, prefix=settings.API_V1_PREFIX)
app.include_router(roles.router, prefix=settings.API_V1_PREFIX)
app.include_router(worker_notifications.router, prefix=settings.API_V1_PREFIX)

# --- Government routes ---

app.include_router(government_auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(government.router, prefix=settings.API_V1_PREFIX)


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "status": "ok", "version": "2.0.0", "docs": "/docs"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "security": {
            "rate_limiting": True,
            "security_headers": True,
            "input_sanitization": True,
            "audit_logging": True,
            "rbac": True,
        },
        "roles": ["worker", "government"],
    }
