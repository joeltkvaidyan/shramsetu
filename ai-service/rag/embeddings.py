"""Embeddings wrapper that always returns L2-normalized vectors.

langchain-huggingface 0.1.x does NOT normalize vectors (and rejects a
`normalize_embeddings` kwarg), yet FAISS L2 distance is only a meaningful
semantic score for normalized vectors — with unnormalized ones the distance
is dominated by vector norms (a perfect "e-Shram card" match scored 0.055
against the 0.35 threshold, silently disabling every grounded answer).

Every place that builds or queries the FAISS index must go through this
wrapper so build-time and query-time vectors stay consistent.
"""
from __future__ import annotations

from typing import List

import numpy as np
from langchain_core.embeddings import Embeddings
from langchain_huggingface import HuggingFaceEmbeddings


def _normalize(vectors: List[List[float]]) -> List[List[float]]:
    arr = np.asarray(vectors, dtype="float32")
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # avoid div-by-zero for all-zero vectors
    return (arr / norms).tolist()


class NormalizedHuggingFaceEmbeddings(Embeddings):
    """Subclasses langchain's Embeddings interface so FAISS uses the object
    API (embed_query/embed_documents), normalizing every vector."""

    def __init__(self, model_name: str):
        self._inner = HuggingFaceEmbeddings(model_name=model_name)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return _normalize(self._inner.embed_documents(texts))

    def embed_query(self, text: str) -> List[float]:
        return _normalize([self._inner.embed_query(text)])[0]
