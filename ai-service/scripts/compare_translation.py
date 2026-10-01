"""Side-by-side quality comparison: IndicTrans2 vs NLLB-200 translation.

Loads BOTH engines in one process (they are cached independently) and
translates identical test questions from all five Indic platform languages.
Run from ai-service/:  venv/Scripts/python.exe scripts/compare_translation.py

Reads TRANSLATION_ENGINE from .env but overrides it per-engine here, so this
script works no matter which engine .env currently selects. The NLLB weights
live in ./models/nllb-200-distilled-600M (offline); IndicTrans2 needs its
license accepted + a cached download (see README "Upgrade to IndicTrans2").
"""
from __future__ import annotations

import sys
import time

sys.path.insert(0, ".")

from app.core.config import settings
import app.services.translation_service as ts

# question, language — one per Indic language, phrased like real workers ask.
CASES = [
    ("ई-श्रम पंजीकरण कैसे करें?", "hi"),
    ("ई-श्रम कार्ड के लिए कौन से दस्तावेज़ चाहिए?", "hi"),
    ("क्या मुझे पीएम-श्रम योग्यता मिलेगी?", "hi"),
    ("আমার মজুরি বকেয়া আছে, কোথায় অভিযোগ করব?", "bn"),
    ("నా కార్డు కోసం దరఖాస్తు ఎక్కడ చేయాలి?", "te"),
    ("எனக்கு ஊதியம் கிடைக்கவில்லை, என்ன செய்வது?", "ta"),
    ("എനിക്ക് അപകട ഇൻഷുറൻസ് ലഭിക്കുമോ?", "ml"),
]

EXPECTED_HINTS = [
    "e-shram registration how",
    "documents required for e-shram card",
    "pm-sym eligibility pension",
    "wage pending grievance where",
    "card application where",
    "wages not received what to do",
    "accident insurance eligibility",
]


def run_engine(engine: str) -> list[tuple[str, float]]:
    settings.TRANSLATION_ENGINE = engine
    ts._engines_ready.clear()  # allow (re)load of the forced engine
    ts._engines_failed.clear()

    t0 = time.perf_counter()
    if not ts._resolve_engine():
        print(f"[{engine}] ENGINE NOT AVAILABLE")
        return []
    load_s = time.perf_counter() - t0
    print(f"[{engine}] loaded in {load_s:.1f}s")

    out = []
    for q, lang in CASES:
        t0 = time.perf_counter()
        text, translated = ts.translate_to_english(q, lang)
        dt = (time.perf_counter() - t0) * 1000
        out.append((text, dt))
        flag = "" if translated else "  (NOT TRANSLATED)"
        print(f"  {lang}: {text[:90]}{flag}   [{dt:.0f} ms]")
    return out


def main() -> None:
    print("=" * 78)
    print("TRANSLATION QUALITY COMPARISON — identical questions, both engines")
    print("=" * 78)

    nllb = run_engine("nllb")
    print("-" * 78)
    it2 = run_engine("indictrans2")

    if not nllb or not it2:
        print("\nOne engine unavailable — comparison incomplete (see messages above).")
        return

    print("=" * 78)
    print("SIDE BY SIDE (IndicTrans2 | NLLB)")
    for (q, lang), (a, ta), (b, tb) in zip(CASES, it2, nllb):
        print(f"\n[{lang}] {q}")
        print(f"  IndicTrans2: {a}  ({ta:.0f} ms)")
        print(f"  NLLB-200   : {b}  ({tb:.0f} ms)")


if __name__ == "__main__":
    main()
