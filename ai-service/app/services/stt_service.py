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

# Lazy-loaded faster-whisper models, keyed by size (process-wide cache). Two
# sizes can be resident at once: the general model plus WHISPER_INDIC_MODEL
# for the languages the general model handles badly.
_local_models: dict[str, object] = {}
_model_lock = threading.Lock()

# Surfaced to the worker as HTTP 503 when no decoding pass produced a usable
# transcript. Returning Whisper's repetition garbage is worse than asking the
# worker to try again — garbage used to be translated and fed to retrieval.
UNUSABLE_AUDIO_MESSAGE = (
    "The recording was too unclear to transcribe. Please speak a little louder, "
    "closer to the microphone, and try again."
)

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


def _get_local_model(model_size: str | None = None):
    """Lazy-load faster-whisper once per model size, thread-safely. The first
    load of each size comes from the local Hugging Face cache (no download)."""
    size = model_size or settings.WHISPER_MODEL_SIZE
    model = _local_models.get(size)
    if model is None:
        with _model_lock:
            model = _local_models.get(size)
            if model is None:
                from faster_whisper import WhisperModel

                logger.info(
                    "Loading faster-whisper model=%s device=%s compute=%s",
                    size,
                    settings.WHISPER_DEVICE,
                    settings.WHISPER_COMPUTE_TYPE,
                )
                model = WhisperModel(
                    size,
                    device=settings.WHISPER_DEVICE,
                    compute_type=settings.WHISPER_COMPUTE_TYPE,
                )
                _local_models[size] = model
    return model


def _model_for(language: str | None):
    """Pick the model for one request: the stronger Indic model for non-English
    languages when one is configured, otherwise the general model."""
    if language and language != "en" and settings.WHISPER_INDIC_MODEL:
        return _get_local_model(settings.WHISPER_INDIC_MODEL)
    return _get_local_model()


def prewarm() -> None:
    """Load the model(s) in background threads at boot so the first voice query
    doesn't pay the cold model load — a medium/large model on CPU needs 20-40s,
    which would otherwise blow the proxy timeout on the first Malayalam query."""

    from app.core import warmup

    def _load(size: str | None = None) -> None:
        try:
            _get_local_model(size)
            logger.info(
                "faster-whisper prewarmed (%s/%s) — STT is fully local",
                size or settings.WHISPER_MODEL_SIZE,
                settings.WHISPER_COMPUTE_TYPE,
            )
        except Exception:
            logger.exception("faster-whisper prewarm failed (will retry on first request)")
            raise  # recorded as failed; optional, so it warns instead of gating

    # Optional: STT is the voice path only. Text chat must stay servable on a box
    # where whisper could not load, so neither model gates readiness.
    warmup.REGISTRY.track("stt", _load, required=False)
    if settings.WHISPER_INDIC_MODEL:
        warmup.REGISTRY.track(
            "stt_indic",
            lambda: _load(settings.WHISPER_INDIC_MODEL),
            required=False,
        )


def _transcribe_local(file_bytes: bytes, filename: str, whisper_language: str | None) -> str:
    """faster-whisper accepts any ffmpeg-readable container (webm/opus from
    MediaRecorder, wav, mp3, m4a...). VAD filtering drops silence/hallucinated
    repeats that pure-Whisper models emit on quiet clips."""
    model = _model_for(whisper_language)
    prompt = _CONTEXT_PROMPTS.get(whisper_language or "", _CONTEXT_PROMPTS["en"])

    import tempfile
    from pathlib import Path

    suffix = Path(filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        def _decode(lang: str | None, prompt_text: str, beam_size: int) -> tuple[str, object]:
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
                beam_size=beam_size,
            )
            return " ".join(seg.text.strip() for seg in segments).strip(), info

        def _usable(candidate: str) -> bool:
            """Worth returning: not degenerate repetition AND written in the
            requested language's script."""
            if _is_degenerate(candidate):
                return False
            return not _script_mismatch(candidate, whisper_language or "")

        # Pass ladder. Each entry is (language, prompt, beam_size, label); the
        # first pass that yields a USABLE transcript wins, otherwise we refuse.
        #
        # With the stronger Indic model the forced+beam pass goes FIRST: it is
        # both the most accurate and the most expensive decode, so running the
        # cheap greedy detect pass before it doubled the latency of every
        # Malayalam/Tamil query (measured 116s -> 19s by reordering).
        indic_active = bool(whisper_language and settings.WHISPER_INDIC_MODEL)
        attempts: list[tuple[str | None, str, int, str]] = []
        if indic_active:
            attempts.append((whisper_language, prompt, 5, "forced-beam"))
        attempts.append((None, _CONTEXT_PROMPTS["en"], 1, "detect"))
        if whisper_language and not indic_active:
            attempts.append((whisper_language, prompt, 5, "forced-beam"))

        text = ""
        info = None
        pass_used = attempts[0][3]
        for lang, prompt_text, beam, label in attempts:
            text, info = _decode(lang, prompt_text, beam)
            pass_used = label
            if _usable(text):
                break
            logger.warning(
                "whisper(local) pass=%s unusable (detected=%s prob=%.2f text=%r)",
                label,
                getattr(info, "language", "?"),
                getattr(info, "language_probability", 0.0),
                text[:40],
            )
        else:
            # Every pass produced garbage. The previous code returned it
            # verbatim, so repeated syllables like 'ക്രാക്ക്ക്...' were
            # translated and then used as a retrieval query — which is how
            # "The translation of the given Malayalam text to English is:"
            # ended up as a search query.
            logger.warning(
                "whisper(local) all %d pass(es) unusable — refusing to return garbage",
                len(attempts),
            )
            raise RuntimeError(UNUSABLE_AUDIO_MESSAGE)

        logger.info(
            "whisper(local) requested=%s detected=%s prob=%.2f pass=%s text=%r",
            whisper_language,
            getattr(info, "language", "?"),
            getattr(info, "language_probability", 0.0),
            pass_used,
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
