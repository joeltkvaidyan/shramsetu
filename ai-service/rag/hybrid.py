"""Lexical (BM25) retrieval, fused with the dense FAISS results.

WHY THIS EXISTS
---------------
The dense embedding model is weak on short, entity-style questions. "What is
the Pradhan Mantri Kisan Samman Nidhi?" is a seven-word query whose nearest
neighbours in embedding space are *every* government scheme document that
opens with the same boilerplate ("What is ...? Launched by ... Ministry ...").
Measured on the eval set, the correct scheme document ranked 4th for that
question, and for the Tamil variant it did not reach the candidate window at
all.

The failure is fixable lexically: the scheme name appears *literally* in the
right document. BM25 matches it exactly where embeddings smear it out.

FUSION
------
Reciprocal Rank Fusion (RRF) — rank-based, so BM25's unbounded scores and the
dense 0-1 similarities never have to be put on a common scale:

    score(d) = sum over rankers of 1 / (k + rank(d))

SAFETY (the important part)
---------------------------
BM25 is only ever applied to reorder candidates that ALREADY passed the dense
similarity gate in rag_service. It can never pull a below-threshold chunk into
the answer. That is what keeps off-topic and prompt-injection questions
refused at retrieval time, and the eval asserts it (refusals must stay 100%).

MULTILINGUAL QUERIES
--------------------
ShramSetu translates an Indic question to English before searching, because
most of the corpus is in English. That translation is right for the DENSE
retriever and actively harmful for the LEXICAL one: the Tamil question
"పுலம்பெயர் ... హక్కులు" and its English translation "What rights do migrant
workers have?" both rank the six language sibling documents as a near-tie, but
the English string shares almost no tokens with any of them, so BM25 returns
nothing useful. Measured on eval questions 13/15/16/22/30, BM25 over the
ORIGINAL question put the expected document first in every case where BM25
over the translation missed the window entirely.

So both strings are scored and fused as separate rankers: the translation
carries entity names, the original carries script and language identity.

No third-party dependency: the corpus is ~60 short documents, so an in-memory
scanner is instant and the demo box needs no extra install.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Hashable, Iterable

# \w is Unicode-aware in Python 3, so Devanagari / Tamil / Telugu / Bengali /
# Malayalam tokens are captured as well as Latin ones.
_TOKEN_RE = re.compile(r"\w+", re.UNICODE)

# RRF damping. 20 suits a corpus this small; the usual 60 flattens the
# difference between a first-ranked and a tenth-ranked document here.
RRF_K = 20

# Relative weight of the lexical ranker. Dense retrieval is the stronger
# ranker overall; BM25 is here to rescue entity-name queries, not to overrule
# good semantic matches. At equal weight it demoted correct "migrant worker
# rights" hits in favour of any document that happened to repeat "workers",
# which cost hit@3 — hence a deliberate weight below 1. Tuned on the 31
# labelled factual questions in eval/questions.jsonl (small set: see the
# overfitting caveat in eval/RESULTS.md).
BM25_WEIGHT = 0.3


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


def doc_key(doc) -> tuple:
    """Stable identity for a chunk, shared by both retrievers."""
    meta = getattr(doc, "metadata", None) or {}
    return (meta.get("source_file"), meta.get("chunk_index"))


class BM25Index:
    """Classic Okapi BM25 over an in-memory corpus of (key, text) pairs."""

    def __init__(
        self,
        keys: list[Hashable],
        documents: list[str],
        k1: float = 1.5,
        b: float = 0.75,
    ):
        self.k1 = k1
        self.b = b
        self._keys = list(keys)
        self._tokens = [tokenize(d) for d in documents]
        self._tf = [Counter(toks) for toks in self._tokens]
        self._n = len(self._tokens)
        total = sum(len(t) for t in self._tokens)
        self._avgdl = (total / self._n) if self._n else 1.0
        if not self._avgdl:
            self._avgdl = 1.0
        df: Counter = Counter()
        for tf in self._tf:
            df.update(tf.keys())
        # BM25+ style idf: always positive, so a term that appears in every
        # document still contributes a little instead of a negative score.
        self._idf = {
            term: math.log(1.0 + (self._n - n + 0.5) / (n + 0.5)) for term, n in df.items()
        }

    def scores(self, query: str) -> dict[Hashable, float]:
        """BM25 score per document key. Only documents that matched appear."""
        out: dict[Hashable, float] = {}
        terms = [t for t in tokenize(query) if t in self._idf]
        if not terms or not self._n:
            return out
        for term in terms:
            idf = self._idf[term]
            for i, tf in enumerate(self._tf):
                freq = tf.get(term)
                if not freq:
                    continue
                dl = len(self._tokens[i]) or 1
                denom = freq + self.k1 * (1.0 - self.b + self.b * dl / self._avgdl)
                out[self._keys[i]] = out.get(self._keys[i], 0.0) + idf * (
                    freq * (self.k1 + 1.0)
                ) / denom
        return out


def build_from_store(store) -> BM25Index:
    """Build a BM25 index over exactly the chunks FAISS indexed, in index
    order, so the two retrievers agree on what a 'document' is.

    `index_to_docstore_id` is a MAPPING in some langchain-community versions
    and a METHOD in others, so both are handled.

    Raises if nothing could be read: an empty lexical index is not a degraded
    mode, it is a bug, and silently returning one left the fusion inert while
    the eval still reported plausible-looking numbers.
    """
    keys: list[Hashable] = []
    texts: list[str] = []
    total = int(getattr(store.index, "ntotal", 0))
    mapper = getattr(store, "index_to_docstore_id", None)
    for i in range(total):
        doc = None
        try:
            key = mapper(i) if callable(mapper) else mapper[i]
            doc = store.docstore.search(key)
        except Exception:  # pragma: no cover - defensive per-chunk
            continue
        if doc is None:
            continue
        keys.append(doc_key(doc))
        # Title + body: the title is prepended at index time, so this text
        # already contains the document heading.
        texts.append(getattr(doc, "page_content", "") or "")
    if not keys:
        raise RuntimeError(
            "BM25 build read 0 of %d FAISS chunks — check the docstore/index_to_docstore_id API"
            % total
        )
    return BM25Index(keys, texts)


def fuse(
    dense_order: Iterable,
    bm25_scores: dict[Hashable, float] | Iterable[dict[Hashable, float]],
    k: int = RRF_K,
    bm25_weight: float | None = None,
) -> dict[Hashable, float]:
    """Weighted Reciprocal Rank Fusion over a dense ranking and BM25 scores.

    `dense_order` is an iterable of items already sorted best-first by the
    dense retriever. Returns the fused score per POSITION in that order.

    `bm25_scores` is either ONE score dict or an iterable of them, in which
    case each is fused as an INDEPENDENT ranker. Passing both the worker's
    original question and its English translation is deliberate (see
    MULTILINGUAL QUERIES below); the two rankers disagree often enough that
    collapsing them into one blended query loses whichever one loses.

    `bm25_weight` defaults to the module-level BM25_WEIGHT resolved AT CALL
    TIME, not as a default argument — a default argument captures its value
    when the function is defined, so mutating hybrid.BM25_WEIGHT would
    silently do nothing (which is exactly how the first tuning sweep produced
    20 identical rows).
    """
    if bm25_weight is None:
        bm25_weight = BM25_WEIGHT

    items = list(dense_order)
    fused: dict[int, float] = {}
    for rank in range(len(items)):
        fused[rank] = 1.0 / (k + rank + 1)

    if bm25_weight <= 0:
        return fused

    if isinstance(bm25_scores, dict):
        score_sets = [bm25_scores]
    else:
        score_sets = [s for s in bm25_scores if s]

    key_to_pos = {}
    for rank, item in enumerate(items):
        key_to_pos[doc_key(item)] = rank

    for scores in score_sets:
        # BM25 only gets a rank among documents it actually matched;
        # documents that scored zero are not part of its ranking at all.
        matched = sorted(
            ((key, score) for key, score in scores.items() if score > 0),
            key=lambda kv: kv[1],
            reverse=True,
        )
        for rank, (key, _score) in enumerate(matched):
            pos = key_to_pos.get(key)
            if pos is None:
                # Matched lexically but never survived the dense gate.
                # Deliberately ignored: BM25 must not be able to admit a
                # below-threshold chunk. This is what keeps refusals at 100%.
                continue
            fused[pos] = fused.get(pos, 0.0) + bm25_weight / (k + rank + 1)
    return fused
