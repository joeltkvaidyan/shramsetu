"""Speech-to-text: OpenAI Whisper, running 100% locally (faster-whisper).

This deployment is intentionally offline-first for STT: no cloud STT calls,
no API keys, no rate limits. The engine is faster-whisper — the CTranslate2
port of OpenAI's Whisper — running in-process on CPU.

Model choice (WHISPER_MODEL_SIZE, default "small"):
  - "small" is the interactive choice on CPU: ~6s per short query, consistent.
  - "large-v3-turbo" is OpenAI's flagship large-v3 distilled for speed —
    near-large-v3 accuracy, but CPU-bound boxes measure 28-47s per short
    query. Switch to it (WHISPER_MODEL_SIZE=large-v3-turbo) when the service
    runs on GPU; it then answers in well under 2s.

`transcribe_audio` always runs on a worker thread via the API layer — model
load + inference must never block the event loop.
"""
from __future__ import annotations

import logging
import threading

from app.core.config import settings

logger = logging.getLogger("shramsetu.stt")

_local_model = None  # lazy-loaded faster-whisper model (process-wide singleton)
_model_lock = threading.Lock()

# Short prompts provide vocabulary hints without biasing Whisper toward a
# sentence that the speaker did not say.
_CONTEXT_PROMPTS: dict[str, str] = {
    "en": "Indian migrant worker welfare, e-Shram, government schemes, ration card, minimum wages, ESIC, EPF.",
    "hi": "भारत के प्रवासी श्रमिकों की सरकारी योजनाओं, ई-श्रम, राशन कार्ड और न्यूनतम मजदूरी के बारे में प्रश्न।",
    "bn": "ভারতের পরিযায়ী শ্রমিকদের সরকারি প্রকল্প, ই-শ্রম, রেশন কার্ড এবং ন্যূনতম মজুরি সম্পর্কে প্রশ্ন।",
    "te": "వలస కార్మికుల సంక్షేమం, ఈ-శ్రమ్, ప్రభుత్వ పథకాలు, రేషన్ కార్డు మరియు కనీస వేతనం గురించి ప్రశ్న.",
    "ta": "இந்திய புலம்பெயர் தொழிலாளர்கள் நலன், ஈ-ஷ்ரம், அரசு திட்டங்கள், ரேஷன் அட்டை மற்றும் குறைந்தபட்ச ஊதியம் பற்றிய கேள்வி.",
    "ml": "ഇന്ത്യയിലെ കുടിയേറ്റ തൊഴിലാളികളുടെ ക്ഷേമം, ഇ-ശ്രം, സർക്കാർ പദ്ധതികൾ, റേഷൻ കാർഡ്, കുറഞ്ഞ കൂലി എന്നിവയെക്കുറിച്ചുള്ള ചോദ്യം.",
}


def _iso_lang(language: str | None) -> str | None:
    """'hi-IN' -> 'hi'; None/'' -> None (let Whisper auto-detect)."""
    return (language or "").split("-", 1)[0].lower() or None


# Expected Unicode script per platform language. Whisper large models
# frequently detect Hindi speech as Urdu (same spoken language, different
# script) — the transcript must match the requested language's script or we
# retry with the language forced.
_script_ranges: dict[str, tuple[str, str]] = {
    "hi": ("\u0900", "\u097F"),  # Devanagari
    "bn": ("\u0980", "\u09FF"),  # Bengali
    "te": ("\u0C00", "\u0C7F"),  # Telugu
    "ta": ("\u0B80", "\u0BFF"),  # Tamil
    "ml": ("\u0D00", "\u0D7F"),  # Malayalam
    "en": ("A", "z"),            # basic Latin
}


def _script_mismatch(text: str, language: str) -> bool:
    """True when the transcript is NOT in the requested language's script
    (e.g. Hindi audio decoded as Urdu-Arabic script). Only checked when a
    language hint exists and the text is non-empty."""
    if not text or not text.strip():
        return False
    lo, hi = _script_ranges.get(language, ("", ""))
    if not lo:
        return False
    in_script = sum(1 for ch in text if lo <= ch <= hi)
    return in_script * 2 < len(text.replace(" ", ""))


def _is_degenerate(text: str) -> bool:
    """Detect Whisper's forced-language-mismatch failure signature.

    When the requested language doesn't match the audio (e.g. UI set to
    Malayalam but the worker speaks English), forced decoding reliably
    produces either an EMPTY transcript or degenerate repetition — one or
    two syllables repeated for the whole clip ("ച്ന്ന്ക്ക്ക്ക..."). Both
    must be treated as failure so the caller can retry with auto-detect.

    Checks:
      1. empty / whitespace-only
      2. few distinct base characters over a long run — Indic scripts use
         combining marks, so compare AFTER stripping Unicode marks (Mn/Mc):
         the observed failure was 44 base chars from only 3 distinct ones.
         Natural language never concentrates that hard over 12+ chars.
      3. single character covering >50% of a reasonably long transcript
    """
    import unicodedata

    if not text or not text.strip():
        return True
    compact = text.replace(" ", "").replace("\n", "")
    base = [ch for ch in compact if unicodedata.category(ch)[0] != "M"]
    if len(base) > 6 and len(set(base)) <= 4:
        return True
    if len(compact) >= 12:
        counts: dict[str, int] = {}
        for ch in compact:
            counts[ch] = counts.get(ch, 0) + 1
        if max(counts.values()) / len(compact) > 0.5:
            return True
    return False


def _get_local_model():
    """Lazy-load faster-whisper once per process, thread-safely. The first
    call loads the model from the local Hugging Face cache (no download)."""
    global _local_model
    if _local_model is None:
        with _model_lock:
            if _local_model is None:
                from faster_whisper import WhisperModel

                logger.info(
                    "Loading faster-whisper model=%s device=%s compute=%s",
                    settings.WHISPER_MODEL_SIZE,
                    settings.WHISPER_DEVICE,
                    settings.WHISPER_COMPUTE_TYPE,
                )
                _local_model = WhisperModel(
                    settings.WHISPER_MODEL_SIZE,
                    device=settings.WHISPER_DEVICE,
                    compute_type=settings.WHISPER_COMPUTE_TYPE,
                )
    return _local_model


def prewarm() -> None:
    """Load the model in a background thread at boot so the first voice query
    doesn't pay the cold model load (large-v3-turbo int8 loads in ~10-20s on
    this machine)."""
    def _load() -> None:
        try:
            _get_local_model()
            logger.info(
                "faster-whisper prewarmed (%s/%s) — STT is fully local",
                settings.WHISPER_MODEL_SIZE,
                settings.WHISPER_COMPUTE_TYPE,
            )
        except Exception:
            logger.exception("faster-whisper prewarm failed (will retry on first request)")

    threading.Thread(target=_load, name="whisper-prewarm", daemon=True).start()


def _transcribe_local(file_bytes: bytes, filename: str, whisper_language: str | None) -> str:
    """faster-whisper accepts any ffmpeg-readable container (webm/opus from
    MediaRecorder, wav, mp3, m4a...). VAD filtering drops silence/hallucinated
    repeats that pure-Whisper models emit on quiet clips."""
    model = _get_local_model()
    prompt = _CONTEXT_PROMPTS.get(whisper_language or "", _CONTEXT_PROMPTS["en"])

    import tempfile
    from pathlib import Path

    suffix = Path(filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        def _run(lang: str | None, prompt_text: str) -> tuple[str, object]:
            segments, info = model.transcribe(
                tmp_path,
                language=lang,
                initial_prompt=prompt_text,
                temperature=0.0,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                # Short voice queries: never condition on the previous window
                # (error propagation was feeding Whisper its own hallucinated
                # repeats back as context, degrading accuracy).
                condition_on_previous_text=False,
                # Greedy decoding: beam_size=1 is ~2x faster on CPU than the
                # default beam of 5 with no practical accuracy loss for short
                # voice queries.
                beam_size=1,
            )
            return " ".join(seg.text.strip() for seg in segments).strip(), info

        # Single auto-detect pass in the common case. Forced-language decoding
        # produced degenerate repeats whenever the worker spoke a language
        # different from the UI selection. Auto-detect handles BOTH cases
        # correctly in one pass. The detect pass always uses the English-domain
        # prompt: prompting with the REQUESTED language's script biased
        # detection toward that language even when the audio was a different
        # one.
        text, info = _run(None, _CONTEXT_PROMPTS["en"])

        # Guard: only when output is broken (degenerate, or decoded into the
        # wrong script — Hindi audio coming back as Urdu) AND we were asked
        # for a specific language do we pay for one forced retry.
        if whisper_language and (_is_degenerate(text) or _script_mismatch(text, whisper_language)):
            logger.warning(
                "whisper(local) auto-detect produced bad output %r — retrying forced lang=%s",
                text[:40],
                whisper_language,
            )
            text, info = _run(whisper_language, prompt)
        logger.info(
            "whisper(local) requested=%s detected=%s prob=%.2f text=%r",
            whisper_language,
            info.language,
            info.language_probability,
            text[:80],
        )
        return text
    finally:
        try:
            import os

            os.unlink(tmp_path)
        except OSError:
            pass


def transcribe_audio(file_bytes: bytes, filename: str, language: str | None = None) -> str:
    """Transcribe locally with Whisper. Raises RuntimeError on failure (the
    API layer maps that to a 503 with a user-facing message).

    `language` is a HINT, not a constraint: if forced decoding comes back
    empty/degenerate, we retry once with auto-detection.

    Fully offline: no cloud providers, no API keys, no rate limits. The same
    engine always answers — accuracy comes from the high-end model, not from
    a provider chain."""
    if not file_bytes:
        raise RuntimeError("Empty audio payload")

    whisper_language = _iso_lang(language)
    logger.info("STT provider=local model=%s (offline)", settings.WHISPER_MODEL_SIZE)
    return _transcribe_local(file_bytes, filename, whisper_language)
