"""
ShramSetu AI service configuration.
All values are overridable via environment variables / .env file.

This microservice owns ONLY the AI stack: RAG (FAISS + SentenceTransformers
+ Groq), speech-to-text (faster-whisper) and text-to-speech (Coqui). Auth,
OTP, database, uploads and all CRUD live in the Node.js server
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

    # --- Sarvam AI (Indian-language-native TTS + MT, free tier) ---
    # Get a key at dashboard.sarvam.ai. Used by TTS_PROVIDER=sarvam
    # (Bulbul v3 natural neural voices) and the Sarvam MT translation engine.
    SARVAM_API_KEY: str = ""
    SARVAM_TTS_MODEL: str = "bulbul:v3"
    SARVAM_TTS_SPEAKER: str = "shubh"

    # --- Google Cloud speech (optional) ---
    # Plain API key (enable Cloud Speech-to-Text + Text-to-Speech APIs).
    # Requires billing — the free Sarvam/Groq tiers are the default path.
    GOOGLE_API_KEY: str = ""
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
    # "sarvam" : Sarvam Bulbul v3 neural voices (free tier, natural, ~1s)
    # "google": Google Cloud TTS (GOOGLE_API_KEY, needs billing)
    # Fallback order: sarvam -> google. Local Coqui/gTTS engines were removed
    # (slower and lower quality than the cloud engines).
    TTS_PROVIDER: str = "sarvam"

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
    # HTTP read timeout (seconds) for cloud translation calls. Sarvam MT
    # regularly exceeds 10s on a cold connection and a timeout costs the whole
    # per-request latency budget before the chain can fall through.
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
    RAG_MIN_SIMILARITY: float = 0.45  # eval-justified: off-topic/injection questions score <=0.42, genuine hits >=0.47 (eval/RESULTS.md)

    # --- Languages supported by the platform ---
    SUPPORTED_LANGUAGES: List[str] = ["en", "hi", "bn", "te", "ta", "ml"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
