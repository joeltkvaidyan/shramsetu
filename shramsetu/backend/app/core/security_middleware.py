"""
Production security middleware — rate limiting, security headers, input sanitization.
"""
import html
import logging
import re
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("shramsetu.security")


# ── Rate Limiter ────────────────────────────────────────────────────

class RateLimiter:
    """Simple in-memory sliding-window rate limiter."""

    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        # Remove old entries
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]
        if len(self._requests[key]) >= max_requests:
            return True
        self._requests[key].append(now)
        return False


_rate_limiter = RateLimiter()

# Rate limit rules per endpoint pattern
RATE_LIMIT_RULES = {
    "/api/v1/auth/worker/login": (5, 60),        # 5 attempts per minute
    "/api/v1/auth/worker/register": (3, 300),     # 3 per 5 min
    "/api/v1/auth/worker/otp/request": (3, 300),  # 3 per 5 min
    "/api/v1/auth/government/login": (5, 60),     # 5 per minute
    "/api/v1/chat/ask": (30, 60),                 # 30 per minute
    "/api/v1/chat/transcribe": (20, 60),          # 20 per minute
    "/api/v1/grievances": (20, 60),               # 20 per minute
    "/api/v1/government/notifications/send": (10, 300),  # 10 per 5 min
    "/api/v1/documents/upload": (10, 60),         # 10 per minute
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        client_ip = request.client.host if request.client else "unknown"

        # Find matching rate limit rule
        for pattern, (max_req, window) in RATE_LIMIT_RULES.items():
            if path.startswith(pattern):
                key = f"{client_ip}:{pattern}"
                if _rate_limiter.is_rate_limited(key, max_req, window):
                    logger.warning("[RATE_LIMIT] Blocked %s from %s", path, client_ip)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too many requests. Please try again later."},
                        headers={"Retry-After": str(window)},
                    )
                break

        response = await call_next(request)
        return response


# ── Security Headers ────────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Clickjacking protection
        response.headers["X-Frame-Options"] = "DENY"
        # XSS filter
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions policy — disable camera, microphone, geolocation by default
        response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self' http: https: ws: wss:; "
            "frame-ancestors 'none'"
        )
        # Strict Transport Security (for HTTPS)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Remove server header
        if "server" in response.headers:
            del response.headers["server"]

        return response


# ── Input Sanitization ──────────────────────────────────────────────

# Patterns that indicate potential injection attacks
DANGEROUS_PATTERNS = [
    re.compile(r"<script\b", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),
    re.compile(r"<iframe\b", re.IGNORECASE),
    re.compile(r"<object\b", re.IGNORECASE),
    re.compile(r"<embed\b", re.IGNORECASE),
    re.compile(r"<link\b", re.IGNORECASE),
    re.compile(r"eval\s*\(", re.IGNORECASE),
    re.compile(r"document\.(cookie|write)", re.IGNORECASE),
    re.compile(r"\bunion\s+select\b", re.IGNORECASE),
    re.compile(r";\s*drop\s+table\b", re.IGNORECASE),
]


def sanitize_input(text: str) -> str:
    """Sanitize user input — escape HTML and strip dangerous patterns."""
    if not text:
        return text
    # HTML-escape
    cleaned = html.escape(text)
    return cleaned


def contains_injection(text: str) -> bool:
    """Check if input contains potential injection patterns."""
    if not text:
        return False
    for pattern in DANGEROUS_PATTERNS:
        if pattern.search(text):
            return True
    return False


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only check POST/PUT/PATCH requests
        if request.method in ("POST", "PUT", "PATCH"):
            try:
                body = await request.body()
                if body:
                    body_text = body.decode("utf-8", errors="ignore")
                    if contains_injection(body_text):
                        logger.warning(
                            "[SECURITY] Potential injection detected from %s at %s",
                            request.client.host if request.client else "unknown",
                            request.url.path,
                        )
                        return JSONResponse(
                            status_code=400,
                            content={"detail": "Invalid input detected"},
                        )
            except Exception:
                pass

        response = await call_next(request)
        return response


# ── Request Logging ─────────────────────────────────────────────────

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        client_ip = request.client.host if request.client else "unknown"

        response = await call_next(request)

        duration = time.time() - start
        logger.info(
            "[REQUEST] %s %s %s %d %.3fs",
            client_ip, request.method, request.url.path,
            response.status_code, duration,
        )

        return response
