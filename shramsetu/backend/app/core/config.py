"""
Central application configuration.
All values are overridable via environment variables / .env file.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- App ---
    APP_NAME: str = "ShramSetu"
    ENV: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

    # --- OTP delivery ---
    # Fast2SMS: free trial credits, India-friendly. Leave FAST2SMS_API_KEY
    # empty to fall back to the ConsoleSMSProvider (OTPs logged server-side
    # only — fine for dev/demo, not for real users).
    FAST2SMS_API_KEY: str = ""
    # Dev/test convenience: echo the OTP back in the API response so flows
    # can be tested without an SMS gateway. MUST stay false in production.
    OTP_ECHO_ENABLED: bool = False

    # --- Database ---
    # Defaults to local SQLite for zero-config dev. Set DATABASE_URL to a
    # postgres:// URL in production (docker-compose sets this automatically).
    DATABASE_URL: str = "sqlite:///./shramsetu.db"

    # --- Auth / JWT ---
    JWT_SECRET_KEY: str = "CHANGE_ME_super_secret_dev_key_only"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h

    # --- File storage ---
    # "database" (default): file bytes live in the StoredFile table (BLOB/
    # BYTEA) — survives redeploys and hosts without persistent disks.
    # "disk": local filesystem under UPLOAD_DIR (mount a volume in prod).
    STORAGE_BACKEND: str = "database"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 15
    ALLOWED_UPLOAD_EXTENSIONS: List[str] = [".pdf", ".jpg", ".jpeg", ".png", ".webp"]

    # --- Groq (LLM provider for RAG chatbot + speech-to-text) ---
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_STT_MODEL: str = "whisper-large-v3-turbo"

    # --- RAG ---
    EMBEDDING_MODEL: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    FAISS_INDEX_DIR: str = "./rag/index"
    RAG_SOURCE_DOCS_DIR: str = "./rag/sample_docs"
    RAG_TOP_K: int = 6
    RAG_MIN_SIMILARITY: float = 0.20  # lower threshold = fewer false "no info" responses

    # --- Languages supported by the platform ---
    # This is a registry, not a hard limit: the frontend i18n system and the
    # RAG chatbot are designed to work with any language added here without
    # code changes elsewhere.
    SUPPORTED_LANGUAGES: List[str] = ["en", "hi", "bn", "te", "ta", "ml"]

    # --- CORS ---
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000", "http://192.168.*:5173"]

    # --- Authority notification (grievance forwarding) ---
    # Free by design: no paid email API required. Default provider logs the
    # email instead of sending it (see app/services/notification_service.py).
    # Set SMTP_* to a real mailbox (e.g. a free Gmail account + App Password)
    # to actually send. NOTIFY_AUTHORITIES_ENABLED lets you turn the whole
    # feature off (e.g. in tests) without touching code.
    NOTIFY_AUTHORITIES_ENABLED: bool = True
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@shramsetu.local"
    SMTP_USE_TLS: bool = True

    # Destination mailboxes per authority. These are placeholders — replace
    # with your real state Labour Department / local police-station contact
    # emails before relying on this in production.
    LABOUR_DEPARTMENT_EMAIL: str = "labour-dept@example.gov.in"
    POLICE_DEPARTMENT_EMAIL: str = "police-cell@example.gov.in"

    # Which authorities get notified for each grievance category. Extensible:
    # add a category -> list of authority keys ("labour", "police") without
    # touching notification_service.py's sending logic.
    GRIEVANCE_AUTHORITY_ROUTING: dict = {
        "unpaid_wages": ["labour"],
        "workplace_safety": ["labour"],
        "harassment_abuse": ["labour", "police"],
        "illegal_termination": ["labour"],
        "document_issue": ["labour"],
        "employer_dispute": ["labour"],
        "insurance_claim": ["labour"],
        "accommodation": ["labour"],
        "other": ["labour"],
    }

    # --- Pagination defaults (list endpoints) ---
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
