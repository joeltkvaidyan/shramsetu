# ShramSetu RAG Evaluation Report

- Generated: 2026-10-02T20:46:20
- Mode: **full (live LLM)**
- Translation to English for retrieval: on
- Corpus: 62 active docs indexed (11 superseded docs skipped), 63 vectors in FAISS index
- Retrieval similarity threshold: 0.45 (same as production answer_question)

## Summary

| Metric | Value |
| --- | --- |
| Factual questions | 13 |
| hit@1 | 9/13 = 69% |
| hit@3 | 9/13 = 69% |
| Off-topic + injection (refused at retrieval) | 0/0 = n/a |
| Unanswerable in-domain questions | 0 |
| Unanswerable: mean top-1 similarity | None |

Unanswerable in-domain questions are expected to pass retrieval (they look on-topic); the LLM's grounded flag is what refuses them. Their mean similarity shows how close they sit to genuine hits — the LLM must decide.

## Per-language breakdown

| Language | Factual n | hit@1 | hit@3 | Refusable n | Refused | Unanswerable n | Mean sim |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bn | 1 | 100% | 100% | 0 | n/a | 0 | None |
| en | 5 | 80% | 80% | 0 | n/a | 0 | None |
| hi | 2 | 50% | 50% | 0 | n/a | 0 | None |
| ml | 2 | 50% | 50% | 0 | n/a | 0 | None |
| ta | 1 | 100% | 100% | 0 | n/a | 0 | None |
| te | 2 | 50% | 50% | 0 | n/a | 0 | None |

## Notes and honest caveats

- Factual questions that missed even at hit@3:
  - #52 (en): top1=None sim=0.0 — How much must food delivery platforms contribute to the social security fund?
  - #60 (hi): top1=None sim=0.0 — बाल श्रम से कौन सी उम्र के बच्चों को काम पर रखना सख्त मना है?
  - #64 (te): top1=None sim=0.0 — కార్మిక కాంకాలిదారుల బంధువూతిరహాంకి పరిహారం ఎంత?
  - #68 (ml): top1=None sim=0.0 — കുടിയേറ്റ തൊഴിലാളികളുടെ ഇപ്പോഴത്തെ പരിശോധനാ കേണ്ടിയിട്ടുള്ള പോർട്ടൽ ഏത്?

- Prompt-injection handling beyond retrieval (generation-time) is enforced by the SYSTEM_PROMPT domain rules; see tests/test_prompt_injection.py for the offline guarantees.
