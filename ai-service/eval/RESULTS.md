# ShramSetu RAG Evaluation Report

- Generated: 2026-10-04T09:22:07
- Mode: **retrieval-only (no LLM key needed)**
- Translation to English for retrieval: off (--no-translate)
- Questions scored: 25 (full set) + 25 gold subset
- Corpus: 62 active docs indexed (11 superseded docs skipped), 63 vectors in FAISS index
- Retrieval similarity threshold: 0.45 (same as production answer_question)

## Gold subset (human-verified)

| Q# | Language | Fact checked | Hit? | Overlap |
| --- | --- | --- | --- | --- |
| 1 | English | free to register | MISS | 0.0 |
| 1 | English | 12-digit UAN | MISS | 0.0 |
| 2 | English | Code on Wages, 2019 | MISS | 0.0 |
| 3 | English | BOCW registration mandatory | MISS | 0.0 |
| 4 | English | 26 weeks | MISS | 0.0 |
| 5 | English | 3,000/month pension | MISS | 0.0 |
| 6 | English | file a complaint | MISS | 0.0 |
| 8 | English | 100 days | MISS | 0.0 |
| 9 | English | 5 lakh coverage | MISS | 0.0 |
| 10 | English | 2 lakh coverage | MISS | 0.0 |
| 11 | Hindi | 12-digit UAN | MISS | 0.0 |
| 13 | Hindi | 6,000/year | MISS | 0.0 |
| 17 | Bengali | 12-digit UAN | MISS | 0.0 |
| 18 | Bengali | equal pay | MISS | 0.0 |
| 18 | Bengali | higher education | MISS | 0.0 |
| 21 | Telugu | national database | MISS | 0.0 |
| 25 | Tamil | national database of unorganised workers | MISS | 0.0 |
| 26 | Tamil | equal pay | MISS | 0.0 |
| 26 | Tamil | health insurance | MISS | 0.0 |
| 27 | Tamil | BOCW registration | MISS | 0.0 |
| 31 | Malayalam | 100-day loan | MISS | 0.0 |
| 51 | English | 1-2% aggregator contribution | MISS | 0.0 |
| 59 | Hindi | 2 lakh coverage | MISS | 0.0 |
| 61 | Bengali | street vendor | MISS | 0.0 |
| 62 | Bengali | child labour prohibited | MISS | 0.0 |
| 63 | Telugu | street vendors act | MISS | 0.0 |
| 64 | Telugu | safety committee | MISS | 0.0 |

Gold subset facts covered by the answer: 0/25 (0%)

## Summary

| Metric | Value |
| --- | --- |
| Factual questions | 25 |
| hit@1 | 18/25 = 72% |
| hit@3 | 19/25 = 76% |
| Refusable (off-topic + injection, at retrieval) | 0/0 = n/a |
| Unanswerable in-domain | 0 |
| Unanswerable: mean top-1 similarity | None |

Unanswerable in-domain questions are expected to pass retrieval (they look on-topic); the
LLM's grounded flag is what refuses them. Their mean similarity shows how close they sit to
genuine hits.

System errors are excluded from every rate and counted on their own line. In --full mode a
dead API key returns grounded=False, the same signal a refusal returns, so errors can never
count as successes or as refusals.

## Per-language breakdown

| Language | Factual n | hit@1 | hit@3 | Refusable n | Refused | Unanswerable n | Mean sim |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bengali | 4 | 50% | 50% | 0 | n/a | 0 | None |
| English | 10 | 100% | 100% | 0 | n/a | 0 | None |
| Hindi | 3 | 67% | 67% | 0 | n/a | 0 | None |
| Malayalam | 2 | 50% | 50% | 0 | n/a | 0 | None |
| Tamil | 3 | 67% | 100% | 0 | n/a | 0 | None |
| Telugu | 3 | 33% | 33% | 0 | n/a | 0 | None |

## Notes and honest caveats

- Retrieval-only mode cannot measure generation-time grounding or generation-time injection resistance; the grounded/injection columns above are a retrieval proxy, and the only honest number in this file is what the retrieval gate does.
- The LLM can still refuse above-threshold questions it cannot support, or answer from context we deemed insufficient. See RESULTS_FULL.md for the live-LLM run.
- Factual questions that missed even at hit@3:
  - #59 (Hindi): top1=pm-suraksha-bima-hindi.txt sim=0.546 — जीवन बीमा योजना में प्रीमियम कितना देना पड़ता है?
  - #61 (Bengali): top1=e-shram-portal-bengali.txt sim=0.494 — পিএম স্বনিধি ঋণের জন্য কারা আবেদন করতে পারবেন?
  - #62 (Bengali): top1=e-shram-portal-bengali.txt sim=0.516 — ক্ষমতাবিহীন শিশুদের নিয়োগ নিয়ে আইন কী বলছে?
  - #63 (Telugu): top1=construction-workers-rights-telugu.txt sim=0.469 — స్ట్రీట్ వెండర్ల హక్కులు ఏమిటి? వారిని ఎలా నిర్బంధించలేం?
  - #64 (Telugu): top1=e-shram-portal-telugu.txt sim=0.501 — పనిలో ప్రమాదం జరిగితే నా కార్మికుడికి ఏ సాంకేతిక మద్దతు ఉంటుంది?
  - #67 (Malayalam): top1=migrant-worker-rights-malayalam.txt sim=0.47 — കുട്ടിയുടെ സ്വതന്ത്ര വീട് വാങ്ങാൻ നടപടികൾ എന്ത്?
- Prompt-injection handling beyond retrieval (generation-time) is enforced by the SYSTEM_PROMPT
  domain rules; see tests/test_prompt_injection.py for the offline guarantees.
- This file is REGENERATED on every run and contains numbers only. The reasoning, the
  before/after table and the known limits live in ANALYSIS.md in this directory.
