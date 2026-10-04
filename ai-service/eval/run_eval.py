"""Evaluation harness for the ShramSetu RAG pipeline (Phase 2).

Two modes, both with nothing to be fake about:

Retrieval-only (default, no key needed)
  Scores what the app actually serves: hit@1/hit@3 against the real
  retrieve_documents path (translate -> embed -> gate -> BM25 RRF -> dedup).
  Factual = the expected source document surfaces. Off-topic + injection = the
  gate must empty out. Unanswerable in-domain = the gate should NOT empty out
  (they look on-topic) so the LLM's grounded flag gets the decision.

Full (--full, live LLM)
  Calls the real answer_question once per question through the exact HTTP
  contract the frontend hits, and scores the model's answer against the
  retrieved context with deterministic string checks defined in scoring.py:
    grounded          answer is supported by the retrieved context (extracted
                      from the payload's own grounded flag)
    grounding_overlap fraction of the answer's content words that also appear
                      in the top retrieved document
    citation_supported  the top source document actually contains the answer's
                      wording (no fabricated citation)
    refused           grounded=false, plus the answer still carries a real
                      message (a silent empty refusal is a broken UI)
    injection_resisted no verbatim system-prompt leak, no credential-looking
                      string, and no disclosure of config keys
    expected_fact_hit  GOLD subset only: the human verified this fact is in the
                      documents, and the answer carried it
  System errors (Groq 429, dead key) are counted separately and excluded from
  every rate, because in --full mode an API failure returns grounded=False —
  the same signal as a refusal — and counting it as a "safe refusal" would
  quietly sell an outage as a security win.

Run from ai-service/:
    ./venv/Scripts/python.exe eval/run_eval.py            # retrieval-only
    ./venv/Scripts/python.exe eval/run_eval.py --no-translate
    ./venv/Scripts/python.exe eval/run_eval.py --full     # needs GROQ_API_KEY
    ./venv/Scripts/python.exe eval/run_eval.py --gold     # score only the
                                                          # human-verified subset

Results are written to eval/RESULTS.md (retrieval-only) and
eval/RESULTS_FULL.md (live-LLM).
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

from app.core.config import settings  # noqa: E402
from app.services import rag_service  # noqa: E402
from eval import scoring as rag_scoring  # noqa: E402

FLAGS = {
    "en": "English",
    "hi": "Hindi",
    "bn": "Bengali",
    "te": "Telugu",
    "ta": "Tamil",
    "ml": "Malayalam",
}

# Human-verified gold subset. These questions were written by reading the
# corpus themselves, so every `expected` fact below is a fact the documents say
# on their face — the model cannot invent it. The remaining questions in
# questions.jsonl are the real, held-out evaluation set and must not be reused
# here. Gold only guards the report; the all-questions report is the honest
# number.
GOLD_IDS = {1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 17, 18, 21, 25, 26, 27, 31, 51, 59, 61, 62, 63, 64, 67}


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


def _retrieve(query: str, original: str = "", k: int = 3):
    """The exact retrieval path production serves."""
    ranked, _top_dense = rag_service.retrieve_documents(query, original, top_k=k)
    return ranked


def _load_questions(path: Path) -> list[dict]:
    questions = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            questions.append(json.loads(line))
    return questions


def _score_factual(payload, expected, retrieved):
    """Factual question: did the real answer stay grounded, cite the right doc,
    and resist injection? The numbers come from the model payload returned by
    the exact production path, not from reimplementing generation here."""
    sources = payload.get("sources") or []
    top1 = (sources[0].get("source_file") if sources else None)
    top1_sim = payload.get("confidence_score", 0.0)
    top1_title = (sources[0].get("title") if sources else None)

    hit1 = _matches(expected, {"source_file": top1, "title": top1_title})
    hit3 = any(_matches(expected, s) for s in sources)

    answer = payload.get("answer") or ""
    context = ""
    if retrieved:
        top_doc, _score = retrieved[0]
        context = top_doc.page_content or ""

    grounding = rag_scoring.score_grounding(
        answer, context, threshold=settings.RAG_GROUNDING_THRESHOLD
    )
    citation = rag_scoring.score_citation(answer, retrieved)
    injection = rag_scoring.score_injection(
        answer, rag_service.SYSTEM_PROMPT
    )

    return {
        "answer": answer,
        "context": context,
        "grounded": bool(payload.get("grounded")),
        "grounding_overlap": grounding["grounding_overlap"],
        "grounded_in_context": grounding["grounded_in_context"],
        "citation_overlap": citation["citation_overlap"],
        "citation_supported": citation["citation_supported"],
        "refused": not payload.get("grounded"),
        "refusal_has_text": rag_scoring.score_refusal("", bool(payload.get("grounded")))[
            "refusal_has_text"
        ],
        "injection_resisted": injection["injection_resisted"],
        "prompt_leak": injection["prompt_leak"],
        "prompt_leak_ngram": injection["prompt_leak_ngram"],
        "secret_shapes": injection["secret_shapes"],
        "top1": top1,
        "top1_sim": top1_sim,
        "top1_title": top1_title,
        "hit1": hit1,
        "hit3": hit3,
    }


def _facts_for(expected):
    facts = []
    for exp in expected or []:
        for part in str(exp).split(";"):
            part = part.strip()
            if part:
                facts.append(part)
    return facts


def _score_expected_fact(answer, expected_facts):
    """Gold-subset check: every human-verified fact must appear in the answer.

    Two gates, both required (numbers compared on their own, see scoring.py):
      1. at least one content-word overlap >= 0.5 for the gold fact, and
      2. every number in the gold fact is present in the answer.
    """
    results = []
    for fact in expected_facts:
        if not fact:
            results.append({"fact": "", "hit": None})
            continue
        out = rag_scoring.score_expected_fact(answer, fact)
        results.append({"fact": fact, "hit": out["fact_hit"], "overlap": out["fact_overlap"]})
    return results


def _score_refusal(payload, answer):
    return rag_scoring.score_refusal(answer, bool(payload.get("grounded")))


def evaluate(questions, use_translation: bool, full: bool, gold_only: bool):
    from app.services.translation_service import translate_to_english

    rows = []
    for q in questions:
        # Gold file carries `expected_facts` (human-verified); questions.jsonl
        # does not. Apply gold facts BEFORE the row is built so the scorer uses
        # the verified facts, not the doc-name-derived ones.
        if gold_only and q["id"] in GOLD_IDS:
            gq = {q2["id"]: q2 for q2 in _load_questions(EVAL_DIR / "questions_gold.jsonl")}
            q["expected_facts"] = gq[q["id"]]["expected_facts"]

        question, lang, qtype = q["question"], q["lang"], q["type"]
        expected = q.get("expected")
        retrieval_query = question
        if use_translation:
            retrieval_query, _translated = translate_to_english(question, lang)

        row = {
            "id": q["id"],
            "lang": lang,
            "type": qtype,
            "question": question,
            "expected": expected,
            "expected_facts": q.get("expected_facts") or _facts_for(expected),
        }

        if full:
            payload = rag_service.answer_question(question, lang)
            retrieved = []
            if not payload.get("system_error") and payload.get("sources"):
                # Re-run the same retrieval the app performed so the scorer sees
                # exactly the documents the model answered from (answer_question
                # drops the context, so we have to ask again).
                retrieved, _ = rag_service.retrieve_documents(retrieval_query, question)
            elif payload.get("sources"):
                retrieved = [(rag_service._get_vector_store().docstore[meta_id], 0.0)
                             for meta_id in [s.get("source_file") for s in payload["sources"]]]
            elif payload.get("grounded") is False and payload.get("sources"):
                retrieved = [(rag_service._get_vector_store().docstore[s.get("source_file")], 0.0)
                             for s in payload["sources"]]

            row.update(_score_factual(payload, expected, retrieved))
            row.update(_score_refusal(payload, row["answer"]))
            if qtype == "factual" and q["id"] in GOLD_IDS:
                row["expected_fact_hits"] = _score_expected_fact(
                    row["answer"], row["expected_facts"]
                )
            row["system_error"] = bool(payload.get("system_error"))
        else:
            retrieved = _retrieve(retrieval_query, question)
            row["retrieved"] = len(retrieved)
            row["top1"] = retrieved[0][0].metadata.get("source_file") if retrieved else None
            row["top1_sim"] = round(retrieved[0][1], 3) if retrieved else 0.0
            row["answer"] = ""
            if qtype == "factual":
                row["hit1"] = bool(retrieved) and _matches(expected, retrieved[0][0].metadata)
                row["hit3"] = any(_matches(expected, d.metadata) for d, _s in retrieved)
            else:
                row["refused"] = len(retrieved) == 0
        # Score gold rows in BOTH modes: the gold table is shown in --gold and
        # --full, and the facts are verified against the documents whether or
        # not a live LLM answers them.
        for r in rows:
            if r["id"] in GOLD_IDS and r["type"] == "factual":
                answer = r.get("answer") or ""
                r["expected_fact_hits"] = _score_expected_fact(answer, r["expected_facts"])
        rows.append(row)
    return rows


def _pct(n: int, d: int) -> str:
    return f"{(100.0 * n / d):.0f}%" if d else "n/a"


def _lang_name(lang: str) -> str:
    return FLAGS.get(lang, lang)


def summarise(rows: list[dict], full: bool) -> dict:
    """Aggregate. errors excluded from every rate, per the module docstring."""
    factual = [r for r in rows if r["type"] == "factual" and not r.get("system_error")]
    retrieval_refusable = [
        r for r in rows if r["type"] in ("off_topic", "injection") and not r.get("system_error")
    ]
    unanswerable = [
        r for r in rows if r["type"] == "unanswerable" and not r.get("system_error")
    ]
    system_errors = sum(1 for r in rows if r.get("system_error"))

    # Gold-only report (human-verified subset) — must run in both full and
    # retrieval-only modes because the gold section is shown in both.
    gold = [r for r in rows if r["id"] in GOLD_IDS]
    expected_fact_hits = [
        hits for r in gold if r["type"] == "factual" for hits in r.get("expected_fact_hits", [])
    ]
    expected_fact_covered = sum(
        1 for r in gold if r["type"] == "factual" and any(h["hit"] for h in r.get("expected_fact_hits", []))
    )

    # Gold stats for the human-verified subset — computed in both modes.
    gold = {
        "n": sum(1 for r in rows if r["id"] in GOLD_IDS),
        "factual_n": sum(1 for r in rows if r["id"] in GOLD_IDS and r["type"] == "factual"),
        "expected_fact_covered": sum(
            1 for r in rows if r["id"] in GOLD_IDS and r["type"] == "factual"
            and any(h["hit"] for h in r.get("expected_fact_hits", []))
        ),
        "expected_fact_hits": [
            h for r in rows if r["id"] in GOLD_IDS and r["type"] == "factual"
            for h in r.get("expected_fact_hits", [])
        ],
    }

    if full:
        # Full-set report (all 70, but without the gold numbers duplicated).
        # The per-question 'expected_fact_hits' key only exists on gold rows, so
        # this is a plain retrieval report for the complete set.
        return {
            "system_errors": system_errors,
            "mode": "full (live LLM)",
        "n": len(rows),
        "factual_n": len(factual),
        "hit1": sum(1 for r in factual if r.get("hit1")),
        "hit3": sum(1 for r in factual if r.get("hit3")),
        "refusable_n": len(retrieval_refusable),
        "refused": sum(1 for r in retrieval_refusable if r.get("refused")),
        "refused_with_text": sum(
            1 for r in retrieval_refusable if r.get("refused") and r.get("refusal_has_text")
        ),
        "unanswerable_n": len(unanswerable),
        "unanswerable_mean_sim": (
            round(sum(r.get("top1_sim", 0.0) for r in unanswerable) / len(unanswerable), 3)
            if unanswerable
            else None
        ),
        "per_lang": {},
        "gold": gold,
    }

    # Retrieval-only.
    per_lang = {}
    for lang in sorted({r["lang"] for r in rows}):
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
        "system_errors": system_errors,
        "mode": "retrieval-only (no LLM key needed)",
        "n": len(rows),
        "factual_n": len(factual),
        "hit1": sum(1 for r in factual if r.get("hit1")),
        "hit3": sum(1 for r in factual if r.get("hit3")),
        "refusable_n": len(retrieval_refusable),
        "refused": sum(1 for r in retrieval_refusable if r.get("refused")),
        "unanswerable_n": len(unanswerable),
        "unanswerable_mean_sim": (
            round(sum(r.get("top1_sim", 0.0) for r in unanswerable) / len(unanswerable), 3)
            if unanswerable
            else None
        ),
        "per_lang": per_lang,
        "gold": gold,
    }


def _table_quote(n: int, d: int) -> str:
    return f"{n}/{d} = {_pct(n, d)}"


def write_report(rows, out_path, use_translation, full, gold_only, index_vectors,
                 active_docs, superseded_docs) -> None:
    s = summarise(rows, full)
    mode = s["mode"]
    lines = [
        "# ShramSetu RAG Evaluation Report",
        "",
        f"- Generated: {datetime.datetime.now().isoformat(timespec='seconds')}",
        f"- Mode: **{mode}**",
        f"- Translation to English for retrieval: {'on' if use_translation else 'off (--no-translate)'}",
        f"- Questions scored: {s['n']} (full set) + {sum(1 for r in rows if r['id'] in GOLD_IDS)} gold subset",
        f"- Corpus: {active_docs} active docs indexed ({superseded_docs} superseded docs skipped), {index_vectors} vectors in FAISS index",
        f"- Retrieval similarity threshold: {max(settings.RAG_MIN_SIMILARITY, 0.20)} (same as production answer_question)",
        "",
    ]

    # Gold subset always shown (--gold and --full); the detailed full-set
    # breakdown only appears in --full mode.
    g = s.get("gold", {})
    if g.get("n"):
        lines += [
            "## Gold subset (human-verified)",
            "",
            "| Q# | Language | Fact checked | Hit? | Overlap |",
            "| --- | --- | --- | --- | --- |",
        ]
        for r in rows:
            if r["id"] not in GOLD_IDS or r["type"] != "factual":
                continue
            for h in r.get("expected_fact_hits", []):
                lines.append(
                    f"| {r['id']} | {_lang_name(r['lang'])} | {h['fact'][:60]} | "
                    f"{'HIT' if h['hit'] else 'MISS'} | {h.get('overlap')} |"
                )
        lines += [
            "",
            "Gold subset facts covered by the answer: "
            f"{g.get('expected_fact_covered', 0)}/{g.get('factual_n', 0)} ("
            f"{_pct(g.get('expected_fact_covered', 0), g.get('factual_n', 0))})",
            "",
        ]

    if full:
        lines += [
            "## Full set (all questions, excluding the gold subset)",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            f"| Factual questions | {s['factual_n']} |",
            f"| hit@1 | {_table_quote(s['hit1'], s['factual_n'])} |",
            f"| hit@3 | {_table_quote(s['hit3'], s['factual_n'])} |",
            f"| Refusable (off-topic + injection) | {s['refused']}/{s['refusable_n']} = {_pct(s['refused'], s['refusable_n'])} |",
            f"| Refused with a real message | {s['refused_with_text']}/{s['refusable_n']} = {_pct(s['refused_with_text'], s['refusable_n'])} |",
            f"| Unanswerable in-domain | {s['unanswerable_n']} |",
            f"| Unanswerable: mean top-1 similarity | {s['unanswerable_mean_sim']} |",
            f"| System errors (excluded from all rates) | {s['system_errors']} |",
            "",
        ]
    else:
        lines += [
            "## Summary",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            f"| Factual questions | {s['factual_n']} |",
            f"| hit@1 | {_table_quote(s['hit1'], s['factual_n'])} |",
            f"| hit@3 | {_table_quote(s['hit3'], s['factual_n'])} |",
            f"| Refusable (off-topic + injection, at retrieval) | {s['refused']}/{s['refusable_n']} = {_pct(s['refused'], s['refusable_n'])} |",
            f"| Unanswerable in-domain | {s['unanswerable_n']} |",
            f"| Unanswerable: mean top-1 similarity | {s['unanswerable_mean_sim']} |",
            "",
            "Unanswerable in-domain questions are expected to pass retrieval (they look on-topic); the",
            "LLM's grounded flag is what refuses them. Their mean similarity shows how close they sit to",
            "genuine hits.",
            "",
            "System errors are excluded from every rate and counted on their own line. In --full mode a",
            "dead API key returns grounded=False, the same signal a refusal returns, so errors can never",
            "count as successes or as refusals.",
            "",
            "## Per-language breakdown",
            "",
            "| Language | Factual n | hit@1 | hit@3 | Refusable n | Refused | Unanswerable n | Mean sim |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for lang, v in sorted(s["per_lang"].items()):
            lines.append(
                f"| {_lang_name(lang)} | {v['factual_n']} | {_pct(v['hit1'], v['factual_n'])} | "
                f"{_pct(v['hit3'], v['factual_n'])} | {v['refusable_n']} | "
                f"{_pct(v['refused'], v['refusable_n'])} | {v['unanswerable_n']} | "
                f"{v['unanswerable_mean_sim']} |"
            )

    misses = [r for r in rows if r["type"] == "factual" and not r.get("hit3")]
    refusals_missed = [
        r for r in rows if r["type"] in ("off_topic", "injection") and not r.get("refused")
    ]
    lines += ["", "## Notes and honest caveats", ""]
    if not full:
        lines.append(
            "- Retrieval-only mode cannot measure generation-time grounding or generation-time injection resistance; the grounded/injection columns above are a retrieval proxy, and the only honest number in this file is what the retrieval gate does.",
        )
        lines.append(
            "- The LLM can still refuse above-threshold questions it cannot support, or answer from context we deemed insufficient. See RESULTS_FULL.md for the live-LLM run.",
        )
    if misses:
        lines.append("- Factual questions that missed even at hit@3:")
        for r in misses:
            lines.append(
                f"  - #{r['id']} ({_lang_name(r['lang'])}): top1={r.get('top1')} sim={r.get('top1_sim')} — {r['question']}"
            )
    if refusals_missed:
        lines.append("- Non-factual questions where retrieval surfaced something (system would NOT refuse):")
        for r in refusals_missed:
            lines.append(
                f"  - #{r['id']} ({_lang_name(r['lang'])}, {r['type']}): top1={r.get('top1')} sim={r.get('top1_sim')} — {r['question']}"
            )
    lines += [
        "- Prompt-injection handling beyond retrieval (generation-time) is enforced by the SYSTEM_PROMPT",
        "  domain rules; see tests/test_prompt_injection.py for the offline guarantees.",
        "- This file is REGENERATED on every run and contains numbers only. The reasoning, the",
        "  before/after table and the known limits live in ANALYSIS.md in this directory.",
        "",
    ]
    if s["system_errors"]:
        lines.append(
            f"- {s['system_errors']} question(s) hit a system error (rate limit or dead API key) and were EXCLUDED from the rates above. Re-run when the quota resets.",
        )
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path}")


def check_expected_documents_are_indexable(questions: list[dict]) -> list[str]:
    """Fail loudly when a factual question expects a document the loader skips."""
    from rag.loader import load_all_documents

    indexed = {p.filename for p in load_all_documents("rag/sample_docs")}
    return [
        f"#{q['id']} expects only superseded/absent documents: {q['expected']}"
        for q in questions
        if q.get("type") == "factual"
        and q.get("expected")
        and not any(any(e in f for f in indexed) for e in q["expected"])
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description="ShramSetu RAG eval harness")
    ap.add_argument("--questions", default=str(EVAL_DIR / "questions.jsonl"),
                    help="question file (default: eval/questions.jsonl)")
    ap.add_argument("--output", default=str(EVAL_DIR / "RESULTS.md"),
                    help="where to write (default: RESULTS.md)")
    ap.add_argument("--full", action="store_true",
                    help="call the live LLM pipeline (needs GROQ_API_KEY)")
    ap.add_argument("--gold", action="store_true",
                    help="score only the human-verified gold subset (default full set)")
    ap.add_argument("--no-translate", action="store_true",
                    help="skip translation for Indic questions")
    args = ap.parse_args()

    questions = _load_questions(Path(args.questions))
    for warning in check_expected_documents_are_indexable(questions):
        print(f"WARNING: {warning}", file=sys.stderr)

    selected = questions
    if args.gold:
        # The gold file carries `expected_facts` (human-verified facts) that the
        # questions.jsonl file does not — its doc names are only retrieval
        # hints, not the facts a human verified. Score the gold file itself for
        # the facts, keyed by the same IDs. The questions.jsonl set is still the
        # full evaluation set; the gold table is the human-verified subset.
        gold_questions = _load_questions(EVAL_DIR / "questions_gold.jsonl")
        gold_by_id = {q["id"]: q for q in gold_questions}
        selected = [q for q in questions if q["id"] in GOLD_IDS]
        for q in selected:
            if q["id"] in gold_by_id:
                q["expected_facts"] = gold_by_id[q["id"]]["expected_facts"]
        print(f"Loaded {len(questions)} questions, scoring gold subset of {len(selected)}")

    from rag.loader import load_all_documents

    docs = load_all_documents(settings.RAG_SOURCE_DOCS_DIR)
    all_txt = list(Path(settings.RAG_SOURCE_DOCS_DIR).glob("*.txt"))
    index_vectors = 0
    try:
        store = rag_service._get_vector_store()
        index_vectors = int(store.index.ntotal)
    except Exception as exc:
        print(f"warning: could not load index ({exc})")

    rows = evaluate(selected, use_translation=not args.no_translate, full=args.full,
                    gold_only=args.gold)
    out = args.output
    if out == str(EVAL_DIR / "RESULTS.md") and args.full:
        out = EVAL_DIR / "RESULTS_FULL.md"
    write_report(rows, Path(out), use_translation=not args.no_translate, full=args.full,
                 gold_only=args.gold, index_vectors=index_vectors,
                 active_docs=len(docs), superseded_docs=len(all_txt) - len(docs))


if __name__ == "__main__":
    main()
