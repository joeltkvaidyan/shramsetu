"""Evaluation harness for the ShramSetu RAG pipeline (Phase 3.3).

Retrieval-only mode (default) needs NO Groq key and no LLM: it exercises the
exact retrieval path used by answer_question (translate -> embed -> threshold
-> dedupe) and scores:
  - hit@1 / hit@3  : does the expected source document surface? (factual Qs)
  - correct refusal: nothing retrieved above threshold for unanswerable,
    off-topic and injection questions (the pipeline would return the
    no-information response).

--full additionally calls the real answer_question with a Groq key and scores
the model's grounded flag. Results are written to eval/RESULTS.md.

Run from ai-service/:
    ./venv/Scripts/python.exe eval/run_eval.py            # retrieval-only
    ./venv/Scripts/python.exe eval/run_eval.py --no-translate
    ./venv/Scripts/python.exe eval/run_eval.py --full     # needs GROQ_API_KEY
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
ROOT = EVAL_DIR.parent
sys.path.insert(0, str(ROOT))

from app.core.config import settings          # noqa: E402
from app.services import rag_service          # noqa: E402

THRESHOLD = max(settings.RAG_MIN_SIMILARITY, 0.20)


def _matches(expected, meta) -> bool:
    if not expected:
        return False
    src = str(meta.get("source_file") or "").rsplit(".", 1)[0].lower()
    title = str(meta.get("title") or "").lower()
    for exp in expected:
        e = exp.lower()
        if e == src or e in src or e in title:
            return True
    return False


def _retrieve(query: str, k: int = 3):
    """Mirror of the retrieval stage in rag_service.answer_question."""
    store = rag_service._get_vector_store()
    results = store.similarity_search_with_score(query, k=min(k + 5, 10))
    scored = [(d, rag_service._similarity_from_l2(dist)) for d, dist in results]
    scored = [p for p in scored if p[1] >= THRESHOLD]
    scored.sort(key=lambda p: p[1], reverse=True)
    return rag_service._dedupe_and_rerank(scored, k)


def load_questions(path: Path) -> list[dict]:
    questions = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            questions.append(json.loads(line))
    return questions


def evaluate(questions: list[dict], use_translation: bool, full: bool) -> dict:
    from app.services.translation_service import translate_to_english

    rows = []
    for q in questions:
        question, lang, qtype = q["question"], q["lang"], q["type"]
        expected = q.get("expected")
        retrieval_query = question
        if use_translation:
            retrieval_query, _translated = translate_to_english(question, lang)

        row = {"id": q["id"], "lang": lang, "type": qtype, "question": question}

        if full:
            payload = rag_service.answer_question(question, lang)
            row["grounded"] = bool(payload.get("grounded"))
            row["system_error"] = bool(payload.get("system_error"))
            row["top1"] = (payload.get("sources") or [{}])[0].get("source_file")
            row["top1_sim"] = payload.get("confidence_score", 0.0)
            if qtype == "factual":
                row["hit1"] = bool(payload.get("sources")) and _matches(
                    expected, {"source_file": row["top1"], "title": payload.get("source_document")}
                )
                row["hit3"] = any(
                    _matches(expected, s) for s in (payload.get("sources") or [])
                )
            else:
                row["refused"] = not payload.get("grounded")
        else:
            retrieved = _retrieve(retrieval_query)
            row["retrieved"] = len(retrieved)
            row["top1"] = retrieved[0][0].metadata.get("source_file") if retrieved else None
            row["top1_sim"] = round(retrieved[0][1], 3) if retrieved else 0.0
            if qtype == "factual":
                row["hit1"] = bool(retrieved) and _matches(expected, retrieved[0][0].metadata)
                row["hit3"] = any(_matches(expected, d.metadata) for d, _s in retrieved)
            else:
                row["refused"] = len(retrieved) == 0
        rows.append(row)
    return rows


def _pct(n: int, d: int) -> str:
    return f"{(100.0 * n / d):.0f}%" if d else "n/a"


def summarise(rows: list[dict]) -> dict:
    factual = [r for r in rows if r["type"] == "factual"]
    # Off-topic and injection questions SHOULD be refused at retrieval time.
    # Unanswerable in-domain questions legitimately pass retrieval (they look
    # on-topic); refusing them is the LLM's grounded flag's job, so we report
    # them separately with their top-1 similarity instead of as "failures".
    retrieval_refusable = [r for r in rows if r["type"] in ("off_topic", "injection")]
    unanswerable = [r for r in rows if r["type"] == "unanswerable"]
    langs = sorted({r["lang"] for r in rows})
    per_lang = {}
    for lang in langs:
        f = [r for r in factual if r["lang"] == lang]
        rr = [r for r in retrieval_refusable if r["lang"] == lang]
        ua = [r for r in unanswerable if r["lang"] == lang]
        per_lang[lang] = {
            "factual_n": len(f),
            "hit1": sum(1 for r in f if r.get("hit1")),
            "hit3": sum(1 for r in f if r.get("hit3")),
            "refusable_n": len(rr),
            "refused": sum(1 for r in rr if r.get("refused")),
            "unanswerable_n": len(ua),
            "unanswerable_mean_sim": (
                round(sum(r.get("top1_sim", 0.0) for r in ua) / len(ua), 3) if ua else None
            ),
        }
    return {
        "factual_n": len(factual),
        "hit1": sum(1 for r in factual if r.get("hit1")),
        "hit3": sum(1 for r in factual if r.get("hit3")),
        "refusable_n": len(retrieval_refusable),
        "refused": sum(1 for r in retrieval_refusable if r.get("refused")),
        "unanswerable_n": len(unanswerable),
        "unanswerable_mean_sim": (
            round(sum(r.get("top1_sim", 0.0) for r in unanswerable) / len(unanswerable), 3)
            if unanswerable else None
        ),
        "per_lang": per_lang,
    }


def write_report(rows: list[dict], out_path: Path, use_translation: bool, full: bool,
                 index_vectors: int, active_docs: int, superseded_docs: int) -> None:
    s = summarise(rows)
    mode = "full (live LLM)" if full else "retrieval-only (no LLM key needed)"
    lines = [
        "# ShramSetu RAG Evaluation Report",
        "",
        f"- Generated: {datetime.datetime.now().isoformat(timespec='seconds')}",
        f"- Mode: **{mode}**",
        f"- Translation to English for retrieval: {'on' if use_translation else 'off (--no-translate)'}",
        f"- Corpus: {active_docs} active docs indexed ({superseded_docs} superseded docs skipped), "
        f"{index_vectors} vectors in FAISS index",
        f"- Retrieval similarity threshold: {THRESHOLD} (same as production answer_question)",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Factual questions | {s['factual_n']} |",
        f"| hit@1 | {s['hit1']}/{s['factual_n']} = {_pct(s['hit1'], s['factual_n'])} |",
        f"| hit@3 | {s['hit3']}/{s['factual_n']} = {_pct(s['hit3'], s['factual_n'])} |",
        f"| Off-topic + injection (refused at retrieval) | {s['refused']}/{s['refusable_n']} = {_pct(s['refused'], s['refusable_n'])} |",
        f"| Unanswerable in-domain questions | {s['unanswerable_n']} |",
        f"| Unanswerable: mean top-1 similarity | {s['unanswerable_mean_sim']} |",
        "",
        "Unanswerable in-domain questions are expected to pass retrieval (they look "
        "on-topic); the LLM's grounded flag is what refuses them. Their mean "
        "similarity shows how close they sit to genuine hits — the LLM must decide.",
        "",
        "## Per-language breakdown",
        "",
        "| Language | Factual n | hit@1 | hit@3 | Refusable n | Refused | Unanswerable n | Mean sim |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for lang, v in sorted(s["per_lang"].items()):
        lines.append(
            f"| {lang} | {v['factual_n']} | {_pct(v['hit1'], v['factual_n'])} | "
            f"{_pct(v['hit3'], v['factual_n'])} | {v['refusable_n']} | "
            f"{_pct(v['refused'], v['refusable_n'])} | {v['unanswerable_n']} | "
            f"{v['unanswerable_mean_sim']} |"
        )

    misses = [r for r in rows if r["type"] == "factual" and not r.get("hit3")]
    refusals_missed = [r for r in rows if r["type"] in ("off_topic", "injection") and not r.get("refused")]
    lines += ["", "## Notes and honest caveats", ""]
    if not full:
        lines.append(
            "- Retrieval-only mode cannot measure generation-time grounding; "
            "`groundedness` above is a retrieval proxy: a factual question counts as "
            "answerable only if the expected official document is retrieved, and a "
            "non-factual question counts as refused only if nothing crosses the "
            "similarity threshold."
        )
        lines.append(
            "- The LLM can still refuse above-threshold questions it cannot support "
            "from context (more refusals in practice), or answer from context we "
            "deemed insufficient — check `--full` mode with a Groq key for that."
        )
    if misses:
        lines.append("- Factual questions that missed even at hit@3:")
        for r in misses:
            lines.append(f"  - #{r['id']} ({r['lang']}): top1={r.get('top1')} sim={r.get('top1_sim')} — {r['question']}")
    if refusals_missed:
        lines.append("- Non-factual questions where retrieval surfaced something (system would NOT refuse):")
        for r in refusals_missed:
            lines.append(f"  - #{r['id']} ({r['lang']}, {r['type']}): top1={r.get('top1')} sim={r.get('top1_sim')} — {r['question']}")
    lines += [
        "",
        "- Prompt-injection handling beyond retrieval (generation-time) is enforced "
        "by the SYSTEM_PROMPT domain rules; see tests/test_prompt_injection.py for "
        "the offline guarantees.",
        "",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path}")


def main() -> None:
    ap = argparse.ArgumentParser(description="ShramSetu RAG eval harness")
    ap.add_argument("--questions", default=str(EVAL_DIR / "questions.jsonl"))
    ap.add_argument("--output", default=str(EVAL_DIR / "RESULTS.md"))
    ap.add_argument("--no-translate", action="store_true", help="skip translation for Indic questions")
    ap.add_argument("--full", action="store_true", help="call the real LLM pipeline (needs GROQ_API_KEY)")
    args = ap.parse_args()

    questions = load_questions(Path(args.questions))
    print(f"Loaded {len(questions)} questions")

    from rag.loader import load_all_documents

    docs = load_all_documents(settings.RAG_SOURCE_DOCS_DIR)
    all_txt = list(Path(settings.RAG_SOURCE_DOCS_DIR).glob("*.txt"))
    index_vectors = 0
    try:
        store = rag_service._get_vector_store()
        index_vectors = int(store.index.ntotal)
    except Exception as exc:  # pragma: no cover - report continues without index
        print(f"warning: could not load index ({exc})")

    rows = evaluate(questions, use_translation=not args.no_translate, full=args.full)
    s = summarise(rows)
    print(f"hit@1 {s['hit1']}/{s['factual_n']}  hit@3 {s['hit3']}/{s['factual_n']}  "
          f"retrieval refusals {s['refused']}/{s['refusable_n']}  "
          f"unanswerable mean sim {s['unanswerable_mean_sim']}")
    write_report(rows, Path(args.output), use_translation=not args.no_translate, full=args.full,
                 index_vectors=index_vectors, active_docs=len(docs), superseded_docs=len(all_txt) - len(docs))


if __name__ == "__main__":
    main()
