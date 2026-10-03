import { Router } from "express";
import multer from "multer";
import { ChatMessage } from "../models/Document.js";
import { authenticate, requireWorker } from "../middleware/auth.js";
import { config } from "../config.js";
import { validateAudioUpload } from "../utils/fileValidation.js";

const router = Router();
// Memory storage: recordings are forwarded straight through and never touch disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

const LANGS = ["en", "hi", "bn", "te", "ta", "ml"];

/**
 * Strip obvious PII before text reaches ANY external provider (Groq LLM,
 * Sarvam MT/TTS, Google). Removes 10-digit Indian mobile numbers and
 * 12-digit Aadhaar-like sequences, replacing them with a placeholder.
 * The original text stays in the worker's own chat history (local DB).
 */
export function stripPii(text) {
  return String(text)
    .replace(/(^|\D)([6-9]\d{9})(?=\D|$)/g, "$1<phone>")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "<id>"); // Aadhaar-style XXXX XXXX XXXX or 12 digits
}

async function aiFetch(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  try {
    const headers = { ...(init.headers || {}) };
    if (config.aiInternalKey) headers["X-Internal-Key"] = config.aiInternalKey;
    return await fetch(`${config.aiServiceUrl}${path}`, { signal: controller.signal, ...init, headers });
  } finally {
    clearTimeout(timer);
  }
}

// Used both when the AI service is unreachable AND when it is still warming up
// after a restart (it answers 503 with ready=false rather than blocking). The
// wording covers both cases honestly instead of promising a specific cause.
const LANG_FALLBACKS = {
  en: { answer: "The AI assistant is starting up or unavailable right now. Please try again in a minute.", simple_explanation: "Service unavailable" },
  hi: { answer: "AI सहायक अभी उपलब्ध नहीं है। कृपया एक मिनट में फिर से कोशिश करें।", simple_explanation: "सेवा अनुपलब्ध" },
  bn: { answer: "AI সহকারী এই মুহূর্তে উপলব্ধ নয়। এক মিনিট পরে আবার চেষ্টা করুন।", simple_explanation: "পরিষেবা অনুপলব্ধ" },
  te: { answer: "AI సహాయకుడు ప్రస్తుతం అందుబాటులో లేరు. ఒక నిమిషంలో మళ్లీ ప్రయత్నించండి.", simple_explanation: "సేవ అందుబాటులో లేదు" },
  ta: { answer: "AI உதவியாளர் தற்போது கிடைக்கவில்லை. ஒரு நிமிடத்தில் மீண்டும் முயற்சிக்கவும்.", simple_explanation: "சேவை கிடைக்கவில்லை" },
  ml: { answer: "AI സഹായി ഇപ്പോൾ ലഭ്യമല്ല. ഒരു നിമിഷത്തിനുള്ളിൽ വീണ്ടും ശ്രമിക്കുക.", simple_explanation: "സേവനം ലഭ്യമല്ല" },
};

function unavailableAnswer(lang) {
  const fb = LANG_FALLBACKS[lang] || LANG_FALLBACKS.en;
  return {
    answer: fb.answer,
    simple_explanation: fb.simple_explanation,
    source_document: null,
    government_department: null,
    confidence_score: 0,
    last_updated_date: null,
    grounded: false,
    system_error: true,
    sources: [],
  };
}

// POST /api/v1/chat/ask { question, language }
router.post("/ask", authenticate, requireWorker, async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const language = LANGS.includes(req.body?.language) ? req.body.language : "en";
  if (!question) return res.status(422).json({ detail: "question is required" });
  if (question.length > 2000) return res.status(422).json({ detail: "question too long" });

  await ChatMessage.create({ user_id: req.userId, role: "user", content: question, language });

  let payload;
  try {
    const r = await aiFetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: stripPii(question), language }),
    });
    // A non-2xx from the AI service is a real response, not a crash: 503 with
    // ready=false means it is still warming up after its own bounded wait.
    // Falling back here is what turns "still starting" into the localised
    // message below instead of an unhandled error — the upstream body has no
    // `answer` field, so it must never be treated as a ChatAnswer.
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn(`[chat/ask] ai-service ${r.status}:`, err.detail || "(no detail)");
      payload = unavailableAnswer(language);
    } else {
      payload = await r.json();
    }
  } catch (err) {
    console.warn("[chat/ask] ai-service unavailable:", err.message);
    payload = unavailableAnswer(language);
  }

  await ChatMessage.create({ user_id: req.userId, role: "assistant", content: payload.answer, language, meta: payload });
  res.json(payload);
});

// GET /api/v1/chat/history
router.get("/history", authenticate, requireWorker, async (req, res) => {
  try {
    const rows = await ChatMessage.find({ user_id: req.userId }).sort({ createdAt: -1 }).limit(40);
    res.json(rows.reverse().map((m) => m.toJSON()));
  } catch (err) {
    console.error("[chat/history]", err);
    res.status(500).json({ detail: "Could not load history." });
  }
});

// DELETE /api/v1/chat/history
router.delete("/history", authenticate, requireWorker, async (req, res) => {
  try {
    await ChatMessage.deleteMany({ user_id: req.userId });
    res.json({ detail: "History cleared" });
  } catch (err) {
    console.error("[chat/history clear]", err);
    res.status(500).json({ detail: "Could not clear history." });
  }
});

// GET /api/v1/chat/speak?text=&language= → audio blob from ai-service TTS
router.get("/speak", authenticate, requireWorker, async (req, res) => {
  try {
    const text = String(req.query.text || "").slice(0, 500);
    const language = LANGS.includes(req.query.language) ? req.query.language : "en";
    if (!text.trim()) return res.status(422).json({ detail: "text is required" });
    const upstream = await aiFetch(`/speak?text=${encodeURIComponent(text)}&language=${language}`);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ detail: "Speech service unavailable." });
    }
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/wav");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.warn("[chat/speak] ai-service unavailable:", err.message);
    res.status(503).json({ detail: "Speech service unavailable." });
  }
});

// POST /api/v1/chat/transcribe (multipart: file, ?language=) → { text }
router.post("/transcribe", authenticate, requireWorker, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(422).json({ detail: "file is required" });
    // Audio-only uploads, hard size cap — validated BEFORE any forwarding.
    const verdict = validateAudioUpload(req.file.mimetype, req.file.size, config.maxUploadMb * 1024 * 1024);
    if (!verdict.ok) return res.status(422).json({ detail: verdict.reason });

    const language = LANGS.includes(req.query.language) ? req.query.language : "en";
    const blob = new Blob([req.file.buffer]);
    const form = new FormData();
    form.append("file", blob, req.file.originalname || "audio.wav");
    const upstream = await aiFetch(`/transcribe?language=${language}`, { method: "POST", body: form });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ detail: "Transcription unavailable." });
    }
    res.json(await upstream.json()); // { text }
  } catch (err) {
    console.warn("[chat/transcribe] ai-service unavailable:", err.message);
    res.status(503).json({ detail: "Transcription unavailable." });
  }
});

export default router;
