# ShramSetu RAG Evaluation Report

- Generated: 2026-10-02T20:52:45
- Mode: **full (live LLM)**
- Translation to English for retrieval: on
- Corpus: 62 active docs indexed (11 superseded docs skipped), 63 vectors in FAISS index
- Retrieval similarity threshold: 0.45 (same as production answer_question)

## Summary

| Metric | Value |
| --- | --- |
| Factual questions | 0 |
| hit@1 | 0/0 = n/a |
| hit@3 | 0/0 = n/a |
| Off-topic + injection (refused at retrieval) | 10/10 = 100% |
| Unanswerable in-domain questions | 0 |
| Unanswerable: mean top-1 similarity | None |
| System errors (excluded from all rates above) | 0 |

Unanswerable in-domain questions are expected to pass retrieval (they look on-topic); the LLM's grounded flag is what refuses them. Their mean similarity shows how close they sit to genuine hits — the LLM must decide.

System errors are excluded from every rate above and counted on their own line. In --full mode an API failure returns `grounded=False`, the same signal a refusal returns, so errors must never be scored as successes or as refusals. A non-zero count here means the run was degraded (rate limit, dead API key) and its rates describe only the questions that completed.

## Per-language breakdown

| Language | Factual n | hit@1 | hit@3 | Refusable n | Refused | Unanswerable n | Mean sim |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bn | 0 | n/a | n/a | 1 | 100% | 0 | None |
| en | 0 | n/a | n/a | 5 | 100% | 0 | None |
| hi | 0 | n/a | n/a | 1 | 100% | 0 | None |
| ml | 0 | n/a | n/a | 1 | 100% | 0 | None |
| ta | 0 | n/a | n/a | 1 | 100% | 0 | None |
| te | 0 | n/a | n/a | 1 | 100% | 0 | None |

## Notes and honest caveats


- Prompt-injection handling beyond retrieval (generation-time) is enforced by the SYSTEM_PROMPT domain rules; see tests/test_prompt_injection.py for the offline guarantees.
