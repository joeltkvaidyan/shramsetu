# ShramSetu RAG Evaluation Report

- Generated: 2026-10-02T17:18:57
- Mode: **retrieval-only (no LLM key needed)**
- Translation to English for retrieval: on
- Corpus: 61 active docs indexed (11 superseded docs skipped), 61 vectors in FAISS index
- Retrieval similarity threshold: 0.45 (same as production answer_question)

## Summary

| Metric | Value |
| --- | --- |
| Factual questions | 31 |
| hit@1 | 26/31 = 84% |
| hit@3 | 27/31 = 87% |
| Off-topic + injection (refused at retrieval) | 11/11 = 100% |
| Unanswerable in-domain questions | 8 |
| Unanswerable: mean top-1 similarity | 0.507 |

Unanswerable in-domain questions are expected to pass retrieval (they look on-topic); the LLM's grounded flag is what refuses them. Their mean similarity shows how close they sit to genuine hits — the LLM must decide.

## Per-language breakdown

| Language | Factual n | hit@1 | hit@3 | Refusable n | Refused | Unanswerable n | Mean sim |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bn | 4 | 75% | 75% | 1 | 100% | 1 | 0.457 |
| en | 10 | 90% | 90% | 6 | 100% | 3 | 0.519 |
| hi | 6 | 100% | 100% | 1 | 100% | 1 | 0.501 |
| ml | 3 | 67% | 67% | 1 | 100% | 1 | 0.511 |
| ta | 4 | 75% | 100% | 1 | 100% | 1 | 0.522 |
| te | 4 | 75% | 75% | 1 | 100% | 1 | 0.508 |

## Notes and honest caveats

- Retrieval-only mode cannot measure generation-time grounding; `groundedness` above is a retrieval proxy: a factual question counts as answerable only if the expected official document is retrieved, and a non-factual question counts as refused only if nothing crosses the similarity threshold.
- The LLM can still refuse above-threshold questions it cannot support from context (more refusals in practice), or answer from context we deemed insufficient — check `--full` mode with a Groq key for that.
- Factual questions that missed even at hit@3:
  - #6 (en): top1=None sim=0.0 — What can I do if my employer does not pay my wages?
  - #18 (bn): top1=construction-osh-code-2020.txt sim=0.49 — প্রবাসী শ্রমিকদের অধিকার কী কী?
  - #22 (te): top1=women-workers-rights.txt sim=0.49 — వలస కార్మికులకు ఏమి హక్కులు ఉన్నాయి?
  - #30 (ml): top1=women-workers-rights.txt sim=0.49 — കുടിയേറ്റ തൊഴിലാളികൾക്ക് എന്ത് അവകാശങ്ങളുണ്ട്?

- Prompt-injection handling beyond retrieval (generation-time) is enforced by the SYSTEM_PROMPT domain rules; see tests/test_prompt_injection.py for the offline guarantees.
