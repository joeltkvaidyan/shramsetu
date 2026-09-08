"""
Multilingual RAG chatbot service — v3 (major upgrade).

Key improvements over v2:
  - Much stronger language enforcement: the model MUST respond entirely in the requested language
  - Improved context formatting with numbered sources for better grounding
  - Lower similarity threshold to reduce false "no info" responses
  - Better handling of cross-language queries
  - Simple explanation is ALWAYS in the requested language
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("shramsetu.rag")

_embeddings = None
_vector_store = None
_llm = None


def _get_embeddings():
    global _embeddings
    if _embeddings is None:
        from rag.embeddings import NormalizedHuggingFaceEmbeddings
        _embeddings = NormalizedHuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
    return _embeddings


def _get_vector_store():
    global _vector_store
    if _vector_store is not None:
        return _vector_store

    from langchain_community.vectorstores import FAISS

    index_path = Path(settings.FAISS_INDEX_DIR)
    if (index_path / "index.faiss").exists():
        _vector_store = FAISS.load_local(
            settings.FAISS_INDEX_DIR, _get_embeddings(), allow_dangerous_deserialization=True
        )
    else:
        from rag.ingest import build_index
        _vector_store = build_index()
    return _vector_store


def _get_llm():
    global _llm
    if _llm is None:
        from langchain_groq import ChatGroq

        if not settings.GROQ_API_KEY:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Add it to backend/.env — get a free key at console.groq.com"
            )
        _llm = ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            temperature=0.1,
            max_tokens=800,
        )
    return _llm


# --- Language names for the system prompt ---
LANG_NAMES = {
    "en": "English",
    "hi": "Hindi (हिन्दी)",
    "bn": "Bengali (বাংলা)",
    "te": "Telugu (తెలుగు)",
    "ta": "Tamil (தமிழ்)",
    "ml": "Malayalam (മലയാളം)",
}

SYSTEM_PROMPT = """You are the ShramSetu AI Welfare Assistant — a government-grade multilingual AI helping Indian migrant workers understand their labour rights, government welfare schemes, and insurance benefits.

## CRITICAL LANGUAGE RULE
You MUST respond ENTIRELY in the requested language. This is the most important rule.
- The "answer" field must be written completely in the requested language.
- The "simple_explanation" field must be written completely in the requested language, using very simple words that a person with basic education can understand.
- DO NOT mix English into your response if the requested language is not English.
- DO NOT provide English translations alongside the response.
- Even technical terms (scheme names, act names) should be transliterated or explained in the local language.

## DOMAIN RULES
1. Answer ONLY using the "CONTEXT" documents provided below. Never invent facts, amounts, eligibility criteria, or scheme details not present in the context.
2. If the CONTEXT does not contain enough information to answer the question, set grounded=false and politely say verified information is not available, suggesting the worker contact the nearest Common Service Centre or labour office.
3. Only answer questions about: migrant worker welfare, labour rights, government schemes (e-Shram, PM-SYM, PM-RPBY, MGNREGA, Ayushman Bharat, etc.), worker documents/IDs, insurance, minimum wages, workplace safety, or grievance procedures. If the question is unrelated, set grounded=false.
4. If the context has partial information, answer with what you have and note what is missing.

## RESPONSE FORMAT
Output ONLY a single valid JSON object with these exact keys:
- "answer": your full answer in the requested language (string)
- "simple_explanation": a very simple 2-3 sentence explanation in the requested language (string)
- "grounded": true if answer is fully supported by context, false otherwise (boolean)
- "confidence_note": one short phrase about how well context supports the answer (string, can be in English)

Example for Hindi question about e-Shram:
{
  "answer": "ई-श्रम पोर्टल (eshram.gov.in) पर पंजीकरण करने पर प्रवासी श्रमिकों को 2 लाख रुपये तक का दुर्घटना बीमा कवर मिलता है। यह पंजीकरण मुफ्त है। पंजीकरण के लिए आपके पास आधार कार्ड और बैंक खाता होना चाहिए।",
  "simple_explanation": "ई-श्रम वेबसाइट पर अपना नाम दर्ज करें। इससे आपको सरकारी योजनाओं का लाभ मिलेगा और दुर्घटना होने पर 2 लाख रुपये मिलेंगे। यह बिल्कुल मुफ्त है।",
  "grounded": true,
  "confidence_note": "Directly from e-Shram registration document"
}
"""


def _format_context(retrieved: list[tuple]) -> str:
    blocks = []
    for i, (doc, score) in enumerate(retrieved, 1):
        meta = doc.metadata
        blocks.append(
            f"[Document {i}: {meta.get('title', 'Unknown')} | Department: {meta.get('department', 'Unknown')} | "
            f"Last Updated: {meta.get('last_updated', 'Unknown')}]\n{doc.page_content}"
        )
    return "\n\n---\n\n".join(blocks)


def _similarity_from_l2(distance: float) -> float:
    """Convert FAISS L2 distance to a 0-1 similarity-like score."""
    return max(0.0, min(1.0, 1.0 / (1.0 + distance)))


def answer_question(question: str, language: str = "en") -> dict:
    try:
        store = _get_vector_store()
    except Exception:
        logger.exception("Failed to load/build the FAISS vector store")
        return _error_response(language)

    try:
        # Retrieve more documents for better context
        results = store.similarity_search_with_score(question, k=min(settings.RAG_TOP_K + 2, 8))
    except Exception:
        logger.exception("Retrieval failed for question: %r", question)
        return _error_response(language)

    if not results:
        return _no_info_response(language)

    # Convert distances -> similarity-like scores
    scored = [(doc, _similarity_from_l2(dist)) for doc, dist in results]

    # Use a lower threshold — the LLM will decide if context is sufficient
    threshold = max(settings.RAG_MIN_SIMILARITY, 0.20)
    scored = [pair for pair in scored if pair[1] >= threshold]

    if not scored:
        return _no_info_response(language)

    top_doc, top_score = max(scored, key=lambda p: p[1])
    context = _format_context(scored)

    try:
        llm = _get_llm()
    except RuntimeError:
        logger.exception("Groq LLM unavailable (likely missing/invalid GROQ_API_KEY)")
        return _error_response(language)

    lang_name = LANG_NAMES.get(language, language)

    messages = [
        ("system", SYSTEM_PROMPT),
        (
            "human",
            f"IMPORTANT: The worker asked in {lang_name}. You MUST respond ENTIRELY in {lang_name}.\n"
            f"Do NOT include any English text in your answer or explanation (except in the confidence_note field).\n\n"
            f"CONTEXT (government welfare documents):\n{context}\n\n"
            f"WORKER'S QUESTION: {question}"
        ),
    ]

    try:
        response = llm.invoke(messages)
        raw = response.content if isinstance(response.content, str) else str(response.content)
    except Exception:
        logger.exception("Groq generation call failed for question: %r", question)
        return _error_response(language)

    parsed = _safe_parse_json(raw)
    if parsed is None:
        logger.warning("Could not parse LLM response as JSON. Raw response: %r", raw)
        return _error_response(language)

    if not parsed.get("grounded", False):
        fallback = parsed.get("answer")
        return _no_info_response(language, override_text=fallback)

    meta = top_doc.metadata
    return {
        "answer": parsed.get("answer", ""),
        "simple_explanation": parsed.get("simple_explanation", ""),
        "source_document": meta.get("title"),
        "government_department": meta.get("department"),
        "confidence_score": round(top_score, 2),
        "last_updated_date": meta.get("last_updated"),
        "grounded": True,
        "system_error": False,
    }


def _safe_parse_json(raw: str) -> Optional[dict]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                return None
        return None


_NO_INFO_TEXT = {
    "en": "Verified information is not available for this question in our official documents. "
    "Please visit your nearest Common Service Centre or labour office, or call the e-Shram helpline 14434.",
    "hi": "इस प्रश्न के लिए हमारे आधिकारिक दस्तावेज़ों में सत्यापित जानकारी उपलब्ध नहीं है। "
    "कृपया अपने नजदीकी कॉमन सर्विस सेंटर या श्रम कार्यालय जाएं, या ई-श्रम हेल्पलाइन 14434 पर कॉल करें।",
    "bn": "এই প্রশ্নের জন্য আমাদের সরকারি নথিতে যাচাইকৃত তথ্য উপলব্ধ নেই। "
    "অনুগ্রহ করে আপনার নিকটতম কমন সার্ভিস সেন্টার বা শ্রম দপ্তরে যান, অথবা ই-শ্রম হেল্পলাইন 14434 নম্বরে কল করুন।",
    "te": "ఈ ప్రశ్నకు మా అధికారిక పత్రాలలో ధృవీకరించబడిన సమాచారం అందుబాటులో లేదు। "
    "దయచేసి మీ సమీప కామన్ సర్వీస్ సెంటర్ లేదా కార్మిక కార్యాలయాన్ని సందర్శించండి, లేదా ఇ-శ్రమ్ హెల్ప్‌లైన్ 14434కి కాల్ చేయండి.",
    "ta": "இந்த கேள்விக்கு எங்கள் அதிகாரப்பூர்வ ஆவணங்களில் சரிபார்க்கப்பட்ட தகவல் இல்லை। "
    "தயவுசெய்து உங்கள் அருகிலுள்ள காமன் சர்வீஸ் சென்டர் அல்லது தொழிலாளர் அலுவலகத்தைப் பார்வையிடவும், அல்லது இ-ஶ்ரம் ஹெல்ப்லைன் 14434ஐ அழைக்கவும்.",
    "ml": "ഈ ചോദ്യത്തിന് ഞങ്ങളുടെ ഔദ്യോഗിക രേഖകളിൽ സ്ഥിരീകരിച്ച വിവരങ്ങൾ ലഭ്യമല്ല। "
    "ദയവായി നിങ്ങളുടെ അടുത്തുള്ള കോമൺ സർവീസ് സെന്റർ അല്ലെങ്കിൽ തൊഴിൽ ഓഫീസ് സന്ദർശിക്കുക, അല്ലെങ്കിൽ ഇ-ശ്രം ഹെൽപ്‌ലൈൻ 14434-ൽ വിളിക്കുക.",
}

_ERROR_TEXT = {
    "en": "Sorry, the assistant hit a technical problem answering that just now. Please try again in a "
    "moment.",
    "hi": "क्षमा करें, सहायक को अभी उत्तर देने में एक तकनीकी समस्या हुई। कृपया थोड़ी देर में पुनः प्रयास करें।",
    "bn": "দুঃখিত, সহায়ক এইমাত্র উত্তর দিতে একটি প্রযুক্তিগত সমস্যায় পড়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
    "te": "క్షమించండి, సహాయకుడికి ఇప్పుడే సమాధానం ఇవ్వడంలో సాంకేతిక సమస్య ఎదురైంది। దయచేసి కొద్దిసేపటిలో మళ్లీ ప్రయత్నించండి।",
    "ta": "மன்னிக்கவும், உதவியாளருக்கு இப்போது பதிலளிப்பதில் ஒரு தொழில்நுட்பப் பிரச்சினை ஏற்பட்டது। தயவுசெய்து சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்।",
    "ml": "ക്ഷമിക്കണം, സഹായിക്ക് ഇപ്പോൾ ഉത്തരം നൽകുന്നതിൽ ഒരു സാങ്കേതിക പ്രശ്നം നേരിട്ടു। ദയവായി അൽപ്പസമയത്തിനുള്ളിൽ വീണ്ടും ശ്രമിക്കുക।",
}


def _no_info_response(language: str, override_text: Optional[str] = None) -> dict:
    text = override_text or _NO_INFO_TEXT.get(language, _NO_INFO_TEXT["en"])
    return {
        "answer": text,
        "simple_explanation": text,
        "source_document": None,
        "government_department": None,
        "confidence_score": 0.0,
        "last_updated_date": None,
        "grounded": False,
        "system_error": False,
    }


def _error_response(language: str) -> dict:
    text = _ERROR_TEXT.get(language, _ERROR_TEXT["en"])
    return {
        "answer": text,
        "simple_explanation": text,
        "source_document": None,
        "government_department": None,
        "confidence_score": 0.0,
        "last_updated_date": None,
        "grounded": False,
        "system_error": True,
    }
