"""Regression: every /transcribe request used to 500.

`_transcribe_local` kept an unused `model` parameter that its own body
shadowed immediately, while `transcribe_audio` called it with three
arguments — `TypeError: _transcribe_local() missing 1 required positional
argument: 'model'` on the live service. The model is resolved inside the
function via the `_model_for` ladder; this test pins that contract.
"""

from pathlib import Path

from app.services import stt_service


class _Seg:
    def __init__(self, text: str) -> None:
        self.text = text


class _Info:
    language = "hi"
    language_probability = 0.98


class _FakeModel:
    """Stands in for faster-whisper: returns one Devanagari segment."""

    def __init__(self) -> None:
        self.calls = 0

    def transcribe(self, path, **kwargs):
        self.calls += 1
        return iter([_Seg("नमस्ते दोस्त")]), _Info()


def test_transcribe_audio_local_path_runs(monkeypatch):
    fake = _FakeModel()
    monkeypatch.setattr(
        stt_service, "_model_for", lambda lang, provider="auto": fake
    )

    out = stt_service.transcribe_audio(b"RIFF....fake wav bytes", "recording.wav", "hi")

    assert out == "नमस्ते दोस्त"
    assert fake.calls == 1


def test_transcribe_audio_rejects_empty_payload():
    try:
        stt_service.transcribe_audio(b"", "recording.wav", "hi")
    except RuntimeError as err:
        assert "Empty audio" in str(err)
    else:  # pragma: no cover - the failure is the expected behaviour
        raise AssertionError("empty payload must raise RuntimeError")


# ── Garbage guard: phrase-level repetition ─────────────────────────
# Live /transcribe used to return this VERBATIM (HTTP 200) when an English
# clip was decoded with language=hi: the forced pass repeats one clause for
# the whole clip. Character-count checks stay green on it (the clause uses
# many distinct characters), so the word-level checks below are what catch it.
_HALLUCINATED = " ".join(["और न्यूनतम मजदूरी के बारे में"] * 10)


def test_degenerate_catches_repeated_clause():
    assert stt_service._is_degenerate(_HALLUCINATED) is True


def test_degenerate_catches_low_vocabulary():
    # Same failure family, different shape: one word over and over.
    assert stt_service._is_degenerate("मजदूरी मजदूरी मजदूरी मजदूरी मजदूरी मजदूरी मजदूरी मजदूरी") is True


def test_degenerate_accepts_natural_transcripts():
    natural = [
        "नमस्ते ये श्रम से तु आप है रोडिगार की जानकारी यहा मिलती है",
        "Kala, this is a voice test for Shranseach.",
        "What is the minimum wage for a worker in Kerala this year?",
        "എന്താണ് കേരളത്തിലെ തൊഴിലാളികളുടെ കുറഞ്ഞ വേതനം?",
    ]
    for text in natural:
        assert stt_service._is_degenerate(text) is False, text


def test_degenerate_flags_short_empty_and_single_char_runs():
    assert stt_service._is_degenerate("") is True
    assert stt_service._is_degenerate("   ") is True
    # The pre-existing character-level guards must keep working.
    assert stt_service._is_degenerate("ക്രാക്ക്ക് ക്രാക്ക്ക് ക്രാക്ക്ക് ക്രാക്ക്ക് ക്രാക്ക്ക്") is True


# ── Fine-tuned checkpoint resolution ──────────────────────────────────
# `hi` used to point at app/models/whisper-hindi-medium-ct2, a directory
# that never existed: WhisperModel raised "Invalid model size <path>",
# /health showed a permanent stt_indic failure, and Hindi silently ran on
# the weak general model.
def test_missing_local_checkpoint_is_treated_as_unconfigured(monkeypatch):
    monkeypatch.setattr(
        stt_service.settings,
        "WHISPER_INDIC_MODELS",
        {"hi": "/nonexistent/converted/whisper-hindi-medium-ct2"},
    )
    monkeypatch.setattr(stt_service.settings, "WHISPER_INDIC_MODEL", "")

    assert stt_service._indic_model_for("hi") is None
    # Falling through means the general model serves Hindi — never a raise.
    fake = _FakeModel()
    monkeypatch.setattr(stt_service, "_get_local_model", lambda size=None: fake)
    assert stt_service._model_for("hi") is fake


def test_published_hf_repo_id_passes_through(monkeypatch):
    monkeypatch.setattr(
        stt_service.settings,
        "WHISPER_INDIC_MODELS",
        {"hi": "ukta-app/whisper-hindi-ct2"},
    )
    assert stt_service._indic_model_for("hi") == "ukta-app/whisper-hindi-ct2"


def test_english_and_unknown_languages_never_use_a_finetune():
    assert stt_service._indic_model_for("en") is None
    assert stt_service._indic_model_for(None) is None


# ── Model source resolution ────────────────────────────────────────────
# Repo ids used to go straight into the HF hub cache, which links each
# snapshot file with os.symlink. Windows refuses that without Developer
# Mode (WinError 1314) and huggingface_hub's optimistic probe lets the
# OSError escape, aborting the model load mid-download — observed live as
# a failed stt_indic warm-up. Repo ids must resolve to plain files instead.
def test_repo_id_detection_separates_ids_paths_and_size_names():
    assert stt_service._looks_like_repo_id("ukta-app/whisper-hindi-ct2") is True
    assert stt_service._looks_like_repo_id("small") is False
    assert stt_service._looks_like_repo_id("small.en") is False
    assert stt_service._looks_like_repo_id("D:/models/hi-ct2") is False
    assert stt_service._looks_like_repo_id("./models/hi-ct2") is False
    assert stt_service._looks_like_repo_id(r"C:\models\hi-ct2") is False


def test_resolve_keeps_local_dirs_and_bare_size_names_untouched(tmp_path):
    converted = tmp_path / "converted"
    converted.mkdir()
    assert stt_service._resolve_model_source(str(converted)) == str(converted)
    assert stt_service._resolve_model_source("small") == "small"


def test_resolve_returns_models_dir_when_already_fetched(tmp_path, monkeypatch):
    monkeypatch.setattr(stt_service, "_MODELS_DIR", tmp_path)
    target = tmp_path / "ukta-app" / "whisper-hindi-ct2"
    target.mkdir(parents=True)
    (target / "model.bin").write_bytes(b"weights")

    # Already on disk => no network, no hub cache, no symlinks.
    assert (
        stt_service._resolve_model_source("ukta-app/whisper-hindi-ct2")
        == str(target)
    )


def test_resolve_fetches_missing_repo_id_with_local_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(stt_service, "_MODELS_DIR", tmp_path)
    calls: dict[str, str] = {}

    import huggingface_hub

    def fake_snapshot_download(repo_id, local_dir):
        calls["repo_id"] = repo_id
        target = Path(local_dir)
        target.mkdir(parents=True, exist_ok=True)
        (target / "model.bin").write_bytes(b"weights")
        return local_dir

    monkeypatch.setattr(huggingface_hub, "snapshot_download", fake_snapshot_download)

    out = stt_service._resolve_model_source("org/some-whisper-ct2")

    assert out == str(tmp_path / "org" / "some-whisper-ct2")
    assert calls["repo_id"] == "org/some-whisper-ct2"
