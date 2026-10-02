"""Indic -> English query translation for the RAG pipeline.

The welfare knowledge base (rag/sample_docs) is written in English, but
workers ask questions in Hindi, Bengali, Telugu, Tamil, Malayalam. The
multilingual embedding model copes partially, but recall is markedly better
when retrieval runs against an English rendering of the question.

Engines (tried in this order):
  0a. Google Cloud Translation v2 — cloud REST call, one round trip
      (~0.3s). Activates when GOOGLE_TRANSLATE_API_KEY (or GOOGLE_API_KEY)
      is set; free tier 500k chars/month. Needs billing enabled.
  0b. Sarvam Machine Translation (sarvam-translate:v1) — cloud REST call
      (~0.5-0.9s), Indian-language-native, works with the SAME
      SARVAM_API_KEY used for TTS. Active whenever that key is present.
  1. IndicTrans2 (ai4bharat/indictrans2-indic-en-1B) — best LOCAL quality for
     Indic languages. The official AI4Bharat repos are LICENSE-GATED: one-time
     acceptance on huggingface.co + `huggingface-cli login`. Preprocessing
     uses the IndicProcessor vendored in app/services/indic_processor.py
     (pure Python — the PyPI IndicTransToolkit >= 1.1 is Cythonized and does
     not build on Windows).
  2. NLLB-200 distilled (facebook/nllb-200-distilled-600M) — Meta's UNGATED
     multilingual translator; same flores language codes, covers all six
     platform languages, no account needed. Final offline fallback so
     translation works out of the box.

Design notes:
  - Translation is RETRIEVAL-side only. The answer is still generated in the
    worker's language; nothing user-facing is translated here.
  - English queries pass through untouched (both models are Indic->En).
  - Models are process-wide singletons; a failed load is remembered so we
    never retry-spam a broken install on every request. If BOTH engines are
    unavailable the question passes through unchanged — retrieval still
    works via multilingual embeddings. The chatbot degrades, it never breaks.
  - Generation uses greedy decoding with a 256-token cap (questions are one
    or two sentences).
"""
from __future__ import annotations

import logging
import threading

from app.core.config import settings

logger = logging.getLogger("shramsetu.translate")

# ISO-639-1 -> flores-style language codes (shared by IndicTrans2 AND NLLB).
_FLORES: dict[str, tuple[str, str]] = {
    "hi": ("hin_Deva", "eng_Latn"),
    "bn": ("ben_Beng", "eng_Latn"),
    "te": ("tel_Telu", "eng_Latn"),
    "ta": ("tam_Taml", "eng_Latn"),
    "ml": ("mal_Mlym", "eng_Latn"),
}

# Romanized/variant codes models may emit; folded back to our set.
_LANG_ALIASES = {"ur": "hi"}

_engines_ready: set[str] = set()
_engines_failed: set[str] = set()
_engine_lock = threading.Lock()


def _google_api_key() -> str:
    """Dedicated Translate key first, shared Google key second."""
    return (
        getattr(settings, "GOOGLE_TRANSLATE_API_KEY", "")
        or settings.GOOGLE_API_KEY
        or ""
    ).strip()


# ── Engine 0b: Sarvam Machine Translation (same key as TTS) ─────────────


# Platform language -> Sarvam BCP-47 locale (hi-IN etc.).
_SARVAM_MT_LANG = {
    "hi": "hi-IN",
    "bn": "bn-IN",
    "te": "te-IN",
    "ta": "ta-IN",
    "ml": "ml-IN",
}


def _translate_sarvam(texts: list[str], src_iso: str) -> list[str]:
    """Sarvam Machine Translation (sarvam-translate:v1) — reuses the TTS key,
    one POST per call (~0.5-0.9s round trip). Handles Indic <-> English
    natively. Raises RuntimeError so the caller can fall through to the
    local engines."""
    import requests

    if not settings.SARVAM_API_KEY:
        raise RuntimeError("engine=sarvam but SARVAM_API_KEY is not set")
    src_locale = _SARVAM_MT_LANG.get(src_iso)
    if src_locale is None:
        raise RuntimeError(f"Sarvam MT has no locale for language={src_iso!r}")

    translated: list[str] = []
    for text in texts:
        response = requests.post(
            "https://api.sarvam.ai/translate",
            headers={"api-subscription-key": settings.SARVAM_API_KEY},
            json={
                "input": text,
                "source_language_code": src_locale,
                "target_language_code": "en-IN",
                "model": "sarvam-translate:v1",
            },
            timeout=settings.TRANSLATE_HTTP_TIMEOUT,
        )
        response.raise_for_status()
        body = response.json()
        out = (body.get("translated_text") or "").strip()
        if not out:
            raise RuntimeError("Sarvam MT returned empty translation")
        translated.append(out)
    return translated


# ── Engine 0: Google Cloud Translation v2 (fastest, key-gated) ──────────


def _translate_google(texts: list[str], src_iso: str) -> list[str]:
    """Google Cloud Translation API v2 — plain API key, no SDK. One HTTP
    round trip regardless of text count (~0.3s typical), so the retrieval
    pipeline stops paying the ~2s local-model inference on every Indic
    /ask. src_iso is the ISO-639-1 code, which v2 uses directly
    (hi/bn/te/ta/ml). Raises RuntimeError on any problem so the caller can
    fall through to the local engines."""
    import requests

    key = _google_api_key()
    if not key:
        raise RuntimeError("engine=google but no Google API key configured")

    response = requests.post(
        "https://translation.googleapis.com/language/translate/v2",
        params={"key": key},
        json={
            "q": texts,
            "source": src_iso,                "target": "en",
                "format": "text",
            },
            timeout=settings.TRANSLATE_HTTP_TIMEOUT,
        )
    response.raise_for_status()
    translations = (response.json().get("data") or {}).get("translations") or []
    if len(translations) != len(texts):
        raise RuntimeError("Google Translate returned mismatched result count")
    return [t.get("translatedText", "").strip() for t in translations]

_indic_model = None
_indic_tokenizer = None
_indic_processor = None
_nllb_model = None
_nllb_tokenizer = None


def _is_indic(language: str) -> bool:
    return language in _FLORES or language in _LANG_ALIASES


def _try_load_indictrans2() -> bool:
    global _indic_model, _indic_tokenizer, _indic_processor
    if _indic_model is not None:
        return True
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        from app.services.indic_processor import IndicProcessor

        src, tgt = "hin_Deva", "eng_Latn"  # any valid pair; tokenizer is shared
        _indic_tokenizer = AutoTokenizer.from_pretrained(
            settings.TRANSLATION_MODEL,
            src_lang=src,
            tgt_lang=tgt,
            trust_remote_code=True,  # AI4Bharat ships custom modeling files
        )
        _indic_model = AutoModelForSeq2SeqLM.from_pretrained(
            settings.TRANSLATION_MODEL, trust_remote_code=True
        )
        if getattr(settings, "TRANSLATION_QUANTIZE", True):
            try:
                import torch

                _indic_model.eval()
                _indic_model = torch.ao.quantization.quantize_dynamic(
                    _indic_model,
                    {torch.nn.Linear},
                    dtype=torch.qint8,
                )
                logger.info("IndicTrans2 dynamically quantized to int8 (CPU)")
            except Exception:
                logger.exception("IndicTrans2 int8 quantization failed — using fp32 weights")
        _indic_processor = IndicProcessor(inference=True)
        logger.info("IndicTrans2 loaded: %s", settings.TRANSLATION_MODEL)
        return True
    except Exception as exc:
        _indic_model = None
        msg = str(exc)
        if "gated" in msg.lower() or "401" in msg or "restricted" in msg.lower():
            logger.warning(
                "IndicTrans2 is license-gated on Hugging Face. One-time fix: "
                "accept the license at https://huggingface.co/%s with a free "
                "account, then run `huggingface-cli login`. Falling back to "
                "NLLB-200 for query translation.",
                settings.TRANSLATION_MODEL,
            )
        else:
            logger.warning(
                "IndicTrans2 unavailable (%s). Falling back to NLLB-200 "
                "for query translation.",
                type(exc).__name__,
            )
        return False


def _try_load_nllb() -> bool:
    global _nllb_model, _nllb_tokenizer
    if _nllb_model is not None:
        return True
    try:
        from transformers import AutoModelForSeq2SeqLM

        # NLLB needs the SentencePiece tokenizer (language-code aware). With
        # only tokenizer.json present, AutoTokenizer falls back to the generic
        # fast tokenizer, which rejects src_lang — force the slow class
        # (sentencepiece.bpe.model is in the local folder) and use LRU mode so
        # language codes cache instead of warning on every call.
        from transformers import NllbTokenizerFast

        _nllb_tokenizer = NllbTokenizerFast.from_pretrained(
            settings.TRANSLATION_FALLBACK_MODEL,
            src_lang="eng_Latn",
            tgt_lang="hin_Deva",
        )
        _nllb_model = AutoModelForSeq2SeqLM.from_pretrained(settings.TRANSLATION_FALLBACK_MODEL)
        logger.info("NLLB-200 fallback loaded: %s", settings.TRANSLATION_FALLBACK_MODEL)
        return True
    except Exception:
        _nllb_model = None
        logger.exception("NLLB-200 fallback also unavailable — Indic queries will be retrieved without translation.")
        return False


def _ensure_engine(name: str) -> bool:
    """Lazily ready one engine; remember failures so we never retry-spam.
    Lock-protected because the boot prewarm thread and a request arriving
    during startup can both try to load the same model."""
    if name in _engines_ready:
        return True
    if name in _engines_failed:
        return False
    with _engine_lock:
        if name in _engines_ready:
            return True
        if name in _engines_failed:
            return False
        if name == "google":
            ok = bool(_google_api_key())
        elif name == "sarvam":
            ok = bool(settings.SARVAM_API_KEY)
        elif name == "indictrans2":
            ok = _try_load_indictrans2()
        else:
            ok = _try_load_nllb()
        (_engines_ready if ok else _engines_failed).add(name)
        return ok


def _resolve_engine() -> str | None:
    """Pick the engine per TRANSLATION_ENGINE: auto | google | sarvam | indictrans2 | nllb."""
    chain = _resolve_chain()
    return chain[0] if chain else None


def _resolve_chain() -> list[str]:
    """Ordered engine list per TRANSLATION_ENGINE:
    auto | google | sarvam | indictrans2 | nllb."""
    pref = (settings.TRANSLATION_ENGINE or "auto").strip().lower()
    if not settings.TRANSLATION_ENABLED or not settings.TRANSLATION_MODEL:
        return []
    if pref in {"google", "sarvam", "indictrans2", "nllb"}:
        return [pref] if _ensure_engine(pref) else []
    # auto: fastest cloud first, then best local quality, then the ungated
    # fallback. Cloud engines are checked by key presence (cheap). Local
    # engines are appended optimistically and only LOADED if the chain ever
    # actually reaches them — eager loading here used to pin IndicTrans2 +
    # NLLB (~3.4 GB) resident even when the cloud engine answered, which
    # swapped this 8 GB box into 30s+ latency spikes.
    chain: list[str] = []
    if _ensure_engine("google"):
        chain.append("google")
    if _ensure_engine("sarvam"):
        chain.append("sarvam")
    chain.append("indictrans2")
    if settings.TRANSLATION_FALLBACK_MODEL:
        chain.append("nllb")
    return chain


# ── Engine 1: IndicTrans2 (IndicProcessor preprocessing + lang tags) ────


def _translate_indictrans2(texts: list[str], src_flores: str, tgt_flores: str) -> list[str]:
    batch = _indic_processor.preprocess_batch(texts, src_lang=src_flores, tgt_lang=tgt_flores)

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    inputs = _indic_tokenizer(
        batch,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=256,
    ).to(device)
    _indic_model.to(device)

    with torch.no_grad():
        # int8-quantized weights + KV cache ON is the measured sweet spot on
        # this 4-core/8GB box. The cache avoids the O(n^2) full recompute,
        # which matters doubly with quantized Linears (quantize/dequantize
        # overhead would otherwise be paid for EVERY token of EVERY step);
        # the vendored modeling file is patched to accept the Cache objects
        # transformers 4.5x passes (models/.../modeling_indictrans.py).
        generated = _indic_model.generate(
            **inputs,
            num_beams=1,  # greedy: questions are short, speed matters
            max_new_tokens=256,
            use_cache=True,
        )

    decoded = _indic_tokenizer.batch_decode(
        generated, skip_special_tokens=True, clean_up_tokenization_spaces=True
    )
    return _indic_processor.postprocess_batch(decoded, lang=tgt_flores)


# ── Engine 2: NLLB-200 (direct tokenizer call, same flores codes) ───────


def _translate_nllb(texts: list[str], src_flores: str, tgt_flores: str) -> list[str]:
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    _nllb_model.to(device)

    # NLLB marks the source language with a prefix token. The NllbTokenizer
    # (slow AND fast variants) exposes `src_lang` as a settable property that
    # makes tokenize() add it; a plain fast tokenizer has no such property,
    # so we prepend the token to the text ourselves instead. Never pass
    # src_lang as a call kwarg — PreTrainedTokenizerFast rejects it.
    try:
        _nllb_tokenizer.src_lang = src_flores
        to_encode = texts
    except Exception:
        to_encode = [f"{src_flores} {t}" for t in texts]

    inputs = _nllb_tokenizer(
        to_encode,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=256,
    ).to(device)

    # NLLB forces the target language via BOS. lang_code_to_id disappeared in
    # newer tokenizers, so resolve the id defensively.
    tgt_id = getattr(_nllb_tokenizer, "lang_code_to_id", {}).get(tgt_flores)
    if tgt_id is None:
        tgt_id = _nllb_tokenizer.convert_tokens_to_ids(tgt_flores)

    with torch.no_grad():
        generated = _nllb_model.generate(
            **inputs,
            forced_bos_token_id=tgt_id,
            num_beams=1,
            max_new_tokens=256,
        )

    return _nllb_tokenizer.batch_decode(
        generated, skip_special_tokens=True, clean_up_tokenization_spaces=True
    )


# Prewarm coordination
_prewarm_done = False


def prewarm() -> None:
    """Load IndicTrans2 (+ int8 quantize) in a background thread at startup.

    Quantization transients (fp32 + int8 copies) happen at boot on an idle
    RAM budget, never during a user request; the first Indic /ask then skips
    a multi-minute cold load that previously froze the endpoint.
    """
    global _prewarm_done
    if _prewarm_done:
        return
    import threading

    def _load():
        global _prewarm_done
        try:
            # A cloud MT engine (Sarvam/Google) answers in under a second and
            # needs no RAM — when one is active, keep IndicTrans2 (~1 GB)
            # UNLOADED so the box keeps headroom for STT/TTS models. It loads
            # on demand if the cloud call ever fails.
            if _ensure_engine("sarvam") or _ensure_engine("google"):
                logger.info("Cloud MT active — skipping IndicTrans2 prewarm (loads on fallback)")
                return
            _ensure_engine("indictrans2")
        except Exception:
            logger.exception("IndicTrans2 prewarm failed (will retry on first request)")
        finally:
            _prewarm_done = True
            if _indic_model is not None:
                logger.info("IndicTrans2 prewarmed (int8=%s)", bool(settings.TRANSLATION_QUANTIZE))

    threading.Thread(target=_load, name="it2-prewarm", daemon=True).start()


def translate_to_english(question: str, language: str | None = None) -> tuple[str, bool]:
    """Translate an Indic question to English for retrieval.

    Returns (query, translated):
      translated=True  -> question was machine-translated (query is English)
      translated=False -> question is English, or translation is unavailable —
                          query is the original text either way.
    """
    lang = (language or "").split("-", 1)[0].lower()
    lang = _LANG_ALIASES.get(lang, lang)
    if not question or not question.strip() or not _is_indic(lang):
        return question, False

    # Walk the chain in order; a mid-request failure of one engine (e.g. the
    # cloud call erroring) falls through to the next instead of giving up.
    chain = _resolve_chain()
    if not chain:
        return question, False
    src, tgt = _FLORES[lang]
    for engine in chain:
        try:
            # Local engines load on first actual use (not at chain build).
            if not _ensure_engine(engine):
                continue
            if engine == "google":
                result = _translate_google([question.strip()], lang)
            elif engine == "sarvam":
                result = _translate_sarvam([question.strip()], lang)
            elif engine == "indictrans2":
                result = _translate_indictrans2([question.strip()], src, tgt)
            else:
                result = _translate_nllb([question.strip()], src, tgt)
            translated = result[0].strip() if result else ""
            if not translated:
                continue
            logger.info("translate %s->en (%s): %r -> %r", lang, engine, question[:60], translated[:60])
            return translated, True
        except Exception as exc:
            # One line, no traceback: a cloud MT hiccup is an expected fall-
            # through, not a crash. The chain has local fallbacks behind it.
            logger.warning(
                "translation engine %r failed (%s: %s); trying next in chain",
                engine,
                type(exc).__name__,
                str(exc)[:120],
            )
    logger.warning("All translation engines failed; using the original question untranslated")
    return question, False
