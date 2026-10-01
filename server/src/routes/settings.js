import { Router } from "express";
import { User } from "../models/User.js";
import { authenticate, requireWorker } from "../middleware/auth.js";

const router = Router();
const LANGS = ["en", "hi", "bn", "te", "ta", "ml"];

router.get("/", authenticate, requireWorker, async (req, res) => {
  const worker = await User.findById(req.userId);
  if (!worker) return res.status(401).json({ detail: "Not authenticated" });
  res.json({ preferred_language: worker.preferred_language || "en" });
});

router.put("/language", authenticate, requireWorker, async (req, res) => {
  const lang = String(req.body?.language || "");
  if (!LANGS.includes(lang)) {
    return res.status(422).json({ detail: `language must be one of ${LANGS.join(", ")}` });
  }
  const worker = await User.findByIdAndUpdate(req.userId, { preferred_language: lang }, { new: true });
  if (!worker) return res.status(401).json({ detail: "Not authenticated" });
  res.json({ preferred_language: worker.preferred_language });
});

export default router;
