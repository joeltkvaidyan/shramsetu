"""
ShramSetu AI service configuration.
All values are overridable via environment variables / .env file.

This microservice owns ONLY the AI stack: RAG (FAISS + SentenceTransformers
+ Groq), speech-to-text (faster-whisper) and text-to-speech (local Meta MMS
VITS). Auth, OTP, database, uploads and all CRUD live in the Node.js server
(shramsetu/server) which calls this service over HTTP.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- App ---
    APP_NAME: str = "ShramSetu"
    ENV: str = "development"
    DEBUG: bool = True

    # --- Service-to-service auth ---
    # When set, every request except GET /health must carry the matching
    # X-Internal-Key header (the Node server sends it from AI_INTERNAL_KEY).
    # Leave empty only for throwaway local debugging.
    AI_INTERNAL_KEY: str = ""
    # Per-IP request cap per minute (simple in-memory limiter; adequate for
    # the single-instance demo deployment).
    AI_RATE_LIMIT_PER_MIN: int = 120

    # --- Groq (LLM provider for RAG chatbot) ---
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    # Gemini (Google) — automatic fallback when Groq is exhausted or rate-limited.
    # Get a free key at aistudio.google.com. One per-project key covers only
    # Gemini 2.0 flash; the code below switches the right model per provider.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # --- Google Cloud Translation (optional, fastest query-translation) ---
    # Plain API key (enable the Cloud Translation API). Falls back to
    # GOOGLE_API_KEY if unset; when neither is set the local IndicTrans2 /
    # NLLB engines are used. Free tier: 500k chars/month.
    GOOGLE_TRANSLATE_API_KEY: str = ""

    # --- Voice: speech-to-text ---
    # STT is fully LOCAL: faster-whisper (CTranslate2 port of OpenAI Whisper)
    # in-process on CPU. No cloud calls, no keys, no rate limits — accuracy
    # comes from the model size, not a provider chain.
    # Model size: small (default) / large-v3-turbo / large-v3 / medium / base.
    # Benchmark on the 8GB 4-core demo box (3.4s Hindi clip):
    #   small            ~6s/query  — interactive, consistent
    #   large-v3-turbo   28-47s/query — near large-v3 accuracy but CPU-bound;
    #                       set WHISPER_MODEL_SIZE=large-v3-turbo on a GPU
    #                       machine where it loads fast and answers <2s.
    WHISPER_MODEL_SIZE: str = "small"
    WHISPER_DEVICE: str = "cpu"        # "cpu" or "cuda"
    WHISPER_COMPUTE_TYPE: str = "int8"  # int8 = fast CPU inference
    # Larger model used ONLY for non-English requests. Malayalam/Tamil are
    # where `small` collapses into repeated-syllable garbage, so they get the
    # stronger model (lazy-loaded, cached alongside the base one). Empty =
    # every language uses WHISPER_MODEL_SIZE.
    WHISPER_INDIC_MODEL: str = ""
    # Max audio accepted at /transcribe (MB) — bounds CPU time and memory.
    MAX_AUDIO_MB: int = 15

    # --- Voice: text-to-speech ---
    # Fully LOCAL: Meta MMS VITS (facebook/mms-tts-*) in-process on CPU, one
    # resident model per active language. No provider keys, no cloud calls —
    # see app/services/tts_service.py. (Sarvam/Google TTS removed.)

    # --- Query translation (RAG retrieval aid) ---
    # IndicTrans2 translates Indic questions to English BEFORE retrieval so a
    # Hindi/Tamil/... query can match the English scheme documents. Answers
    # are still generated in the worker's language — this only improves recall.
    # License note: ai4bharat/indictrans2 models require a one-time license
    # acceptance on Hugging Face (free) + `huggingface-cli login`. While gated,
    # TRANSLATION_FALLBACK_MODEL (Meta NLLB-200, ungated) is used automatically.
    TRANSLATION_MODEL: str = "ai4bharat/indictrans2-indic-en-1B"
    # Dynamic int8 quantization for IndicTrans2 on CPU: ~4x smaller footprint
    # (~1 GB vs ~4 GB fp32) and usually faster linear-heavy inference. On a
    # RAM-constrained box this also stops the weights being paged out between
    # requests. Set TRANSLATION_QUANTIZE=false to keep full fp32 weights.
    TRANSLATION_QUANTIZE: bool = True
    TRANSLATION_FALLBACK_MODEL: str = "facebook/nllb-200-distilled-600M"
    # HTTP read timeout (seconds) for cloud translation calls (Google). A
    # timeout costs the whole per-request latency budget before the chain can
    # fall through.
    TRANSLATE_HTTP_TIMEOUT: int = 20
    TRANSLATION_ENABLED: bool = True
    # Which engine to use: "auto" = IndicTrans2 when loadable (license
    # accepted + HF token), else NLLB fallback. "indictrans2" / "nllb" force
    # one engine (used for quality comparisons); a forced engine that fails
    # to load means translation passes through (never crashes the chatbot).
    TRANSLATION_ENGINE: str = "auto"

    # --- RAG ---
    EMBEDDING_MODEL: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    FAISS_INDEX_DIR: str = "./rag/index"
    RAG_SOURCE_DOCS_DIR: str = "./rag/sample_docs"
    RAG_TOP_K: int = 6
    RAG_MIN_SIMILARITY: float = 0.45  # off-topic/injection questions score <=0.42, genuine hits >=0.47 (eval/RESULTS.md)
    RAG_GROUNDING_THRESHOLD: float = 0.30  # scoring.py: content-word overlap between answer and top context

    # --- Cold start ---
    # How long /ask waits for the boot warm-up to finish before answering with a
    # 503 instead. The Node proxy aborts at AI_TIMEOUT_MS (120s), so a value
    # below that is what turns a would-be proxy timeout into a fast, honest
    # "still starting" reply the worker can retry. Set 0 to fail fast.
    WARMUP_WAIT_SECONDS: float = 90.0

    # --- Languages supported by the platform ---
    SUPPORTED_LANGUAGES: List[str] = ["en", "hi", "bn", "te", "ta", "ml"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
