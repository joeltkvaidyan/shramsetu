# ShramSetu RAG Evaluation Report

- Generated: 2026-10-02T13:47:00
- Mode: **retrieval-only (no LLM key needed)**
- Translation to English for retrieval: on
- Corpus: 61 active docs indexed (11 superseded docs skipped), 61 vectors in FAISS index
- Retrieval similarity threshold: 0.45 (same as production answer_question)

## Summary

| Metric | Value |
| --- | --- |
| Factual questions | 31 |
| hit@1 | 23/31 = 74% |
| hit@3 | 27/31 = 87% |
| Off-topic + injection (refused at retrieval) | 11/11 = 100% |
| Unanswerable in-domain questions | 8 |
| Unanswerable: mean top-1 similarity | 0.531 |

Unanswerable in-domain questions are expected to pass retrieval (they look on-topic); the LLM's grounded flag is what refuses them. Their mean similarity shows how close they sit to genuine hits — the LLM must decide.

## Per-language breakdown

| Language | Factual n | hit@1 | hit@3 | Refusable n | Refused | Unanswerable n | Mean sim |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bn | 4 | 75% | 100% | 1 | 100% | 1 | 0.511 |
| en | 10 | 90% | 90% | 6 | 100% | 3 | 0.528 |
| hi | 6 | 67% | 67% | 1 | 100% | 1 | 0.516 |
| ml | 3 | 67% | 100% | 1 | 100% | 1 | 0.577 |
| ta | 4 | 50% | 75% | 1 | 100% | 1 | 0.549 |
| te | 4 | 75% | 100% | 1 | 100% | 1 | 0.511 |

## Notes and honest caveats

- Retrieval-only mode cannot measure generation-time grounding; `groundedness` above is a retrieval proxy: a factual question counts as answerable only if the expected official document is retrieved, and a non-factual question counts as refused only if nothing crosses the similarity threshold.
- The LLM can still refuse above-threshold questions it cannot support from context (more refusals in practice), or answer from context we deemed insufficient — check `--full` mode with a Groq key for that.
- Factual questions that missed even at hit@3:
  - #6 (en): top1=domestic-workers.txt sim=0.472 — What can I do if my employer does not pay my wages?
  - #13 (hi): top1=pm-shram-yogi-maandhan.txt sim=0.514 — प्रधानमंत्री किसान सम्मान निधि क्या है?
  - #16 (hi): top1=pm-shram-yogi-maandhan.txt sim=0.569 — प्रधानमंत्री आवास योजना क्या है?
  - #28 (ta): top1=pm-svanidhi.txt sim=0.481 — பிஎம் சுரக்ஷா பீமா யோஜனா என்றால் என்ன?

- Prompt-injection handling beyond retrieval (generation-time) is enforced by the SYSTEM_PROMPT domain rules; see tests/test_prompt_injection.py for the offline guarantees.

---

## Reproducing these numbers

    cd ai-service
    ./venv/Scripts/python.exe -m rag.ingest      # rebuild the index
    ./venv/Scripts/python.exe -m eval.run_eval   # retrieval-only, no API key
    ./venv/Scripts/python.exe -m eval.run_eval --full --questions eval/questions_full_safety_b.jsonl

Translations are cached on disk (`.translation_cache.json`, gitignored), so a
repeat run returns identical numbers. Before that cache existed the local
IndicTrans2 fallback produced slightly different translations run to run and
the same unchanged code scored 43/49 on one run and 44/49 on the next.
