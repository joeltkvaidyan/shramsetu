import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { User } from "../models/User.js";
import { OtpCode } from "../models/Document.js";
import { hashPassword, verifyPassword, signToken, sha256, randomOtp } from "../utils/crypto.js";
import { validateDocumentFile } from "../utils/fileValidation.js";
import { config } from "../config.js";
import { authenticate, requireWorker, requireGovernment, audit } from "../middleware/auth.js";
import {
  otpRequestLimiter,
  otpVerifyLimiter,
  workerLoginLimiter,
  governmentLoginLimiter,
  registerLimiter,
} from "../middleware/rateLimit.js";

const router = Router();
// Memory storage: an invalid photo is rejected before anything touches disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

const MOBILE_RE = /^[6-9]\d{9}$/;

// ── OTP delivery: printed to the backend terminal (dev/demo mode) ─────
function sendOtp(mobile, code) {
  const line = "─".repeat(52);
  console.log(`\n${line}`);
  console.log(`  📩 OTP for +91 ${mobile}:  ${code}`);
  console.log(`  (valid ${Math.round(config.otp.expireSeconds / 60)} min — ShramSetu dev terminal delivery)`);
  console.log(`${line}\n`);
  // Mirror to a file so automated checks can assert on THIS run's OTP even
  // when the API runs in a user terminal (node --watch) instead of a log we
  // control. Dev/demo convenience only; OTP_ECHO_ENABLED=false silences both.
  try {
    if (config.otp.echoEnabled) {
      fs.mkdirSync("logs", { recursive: true });
      fs.appendFileSync(
        "logs/otp-dev.log",
        `${new Date().toISOString()} +91 ${mobile} OTP ${code}\n`
      );
    }
  } catch {
    /* best-effort; never block the login flow over a log write */
  }
}

async function issueOtp(mobile, purpose) {
  const now = new Date();
  const cooldown = new Date(now.getTime() - config.otp.resendCooldownSeconds * 1000);

  const recent = await OtpCode.findOne({
    mobile_number: mobile,
    purpose,
    last_sent_at: { $gt: cooldown },
  }).sort({ createdAt: -1 });
  if (recent) {
    const wait = Math.ceil((recent.last_sent_at.getTime() + config.otp.resendCooldownSeconds * 1000 - now.getTime()) / 1000);
    return { wait };
  }

  const code = randomOtp();
  // invalidate previous unconsumed codes for this mobile+purpose
  await OtpCode.updateMany({ mobile_number: mobile, purpose, consumed_at: null }, { consumed_at: now });
  await OtpCode.create({
    mobile_number: mobile,
    code_hash: sha256(code),
    purpose,
    expires_at: new Date(now.getTime() + config.otp.expireSeconds * 1000),
    last_sent_at: now,
  });
  sendOtp(mobile, code);
  return { wait: 0, code };
}

async function consumeOtp(mobile, code, purpose) {
  const row = await OtpCode.findOne({
    mobile_number: mobile,
    purpose,
    consumed_at: null,
    expires_at: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!row) return { ok: false, reason: "OTP expired or not requested. Request a new code." };
  if (row.attempts >= config.otp.maxAttempts) {
    row.consumed_at = new Date();
    await row.save();
    return { ok: false, reason: "Too many attempts. Request a new code." };
  }
  if (row.code_hash !== sha256(code)) {
    row.attempts += 1;
    await row.save();
    return { ok: false, reason: "Incorrect OTP." };
  }
  row.consumed_at = new Date();
  await row.save();
  return { ok: true };
}// ── Worker: register (multipart form) ────────────────────────────────
router.post("/worker/register", registerLimiter, upload.single("profile_photo"), async (req, res) => {
  try {
    const b = req.body;
    const mobile = String(b.mobile_number || "").replace(/\D/g, "");
    if (!MOBILE_RE.test(mobile)) {
      return res.status(422).json({ detail: [{ loc: ["body", "mobile_number"], msg: "Enter a valid 10-digit Indian mobile number" }] });
    }
    if (!b.full_name || String(b.full_name).trim().length < 2) {
      return res.status(422).json({ detail: [{ loc: ["body", "full_name"], msg: "Full name is required" }] });
    }
    if (!b.password || String(b.password).length < 6) {
      return res.status(422).json({ detail: [{ loc: ["body", "password"], msg: "Password must be at least 6 characters" }] });
    }
    // Optional profile photo: validated by CONTENT (must be a real image).
    let photoBuffer = null;
    if (req.file) {
      const verdict = validateDocumentFile(req.file.buffer, req.file.originalname, req.file.size, config.maxUploadMb * 1024 * 1024);
      if (!verdict.ok) return res.status(422).json({ detail: [{ loc: ["body", "profile_photo"], msg: verdict.reason }] });
      if (verdict.kind === "pdf") {
        return res.status(422).json({ detail: [{ loc: ["body", "profile_photo"], msg: "Profile photo must be an image (JPEG, PNG or WEBP)." }] });
      }
      photoBuffer = req.file.buffer;
    }

    const existing = await User.findOne({ role: "worker", mobile_number: mobile });
    if (existing && existing.is_phone_verified) {
      // A verified account can never be re-registered (hijack defense).
      return res.status(409).json({ detail: "A worker with this mobile number already exists. Please log in." });
    }
    if (existing && !existing.is_phone_verified) {
      // Unverified account: do NOT create a duplicate or overwrite the
      // password — just re-send the OTP so the same person can finish
      // verifying, while an attacker who knows the number gets nothing more
      // than a new code delivered to the REAL owner's phone/terminal.
      const { wait } = await issueOtp(mobile, "register");
      if (wait) return res.status(429).json({ detail: `Please wait ${wait}s before requesting another OTP.` });
      return res.status(200).json({ worker_id: existing.worker_id, mobile_number: mobile, resent: true });
    }

    const count = await User.countDocuments({ role: "worker" });
    const workerId = `SS-${String(100000 + count).padStart(6, "0")}`;

    const worker = await User.create({
      worker_id: workerId,
      role: "worker",
      full_name: String(b.full_name).trim(),
      mobile_number: mobile,
      email: b.email || null,
      password_hash: await hashPassword(String(b.password)),
      gender: b.gender || null,
      date_of_birth: b.date_of_birth || null,
      aadhaar_last4: b.aadhaar_number ? String(b.aadhaar_number).replace(/\D/g, "").slice(-4) : null,
      occupation: b.occupation || null,
      years_of_experience: b.years_of_experience ? parseInt(b.years_of_experience, 10) : null,
      preferred_language: b.preferred_language || "en",
      current_address_line: b.current_address_line || null,
      current_village_or_city: b.current_village_or_city || null,
      current_district: b.current_district || null,
      current_state: b.current_state || null,
      current_pincode: b.current_pincode || null,
      native_state: b.native_state || null,
      native_district: b.native_district || null,
      emergency_contact_name: b.emergency_contact_name || null,
      emergency_contact_relation: b.emergency_contact_relation || null,
      emergency_contact_number: b.emergency_contact_number || null,
      is_phone_verified: false,
      consent_ai_processing: true, // privacy notice accepted (checkbox required by the frontend)
    });

    if (photoBuffer) {
      const dest = path.join(config.uploadDir, `${worker._id}-profile`);
      await fs.promises.mkdir(config.uploadDir, { recursive: true });
      await fs.promises.writeFile(dest, photoBuffer);
      worker.profile_photo_path = `${worker._id}-profile`;
      await worker.save();
    }

    const { wait } = await issueOtp(mobile, "register");
    if (wait) {
      return res.status(429).json({ detail: `Please wait ${wait}s before requesting another OTP.` });
    }

    await audit({
      actorRole: "worker", actorIdentifier: mobile, action: "worker.register",
      resourceType: "user", resourceId: String(worker._id), ip: req.ip, success: true,
    });
    res.status(201).json({ worker_id: workerId, mobile_number: mobile });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({ detail: "Registration failed. Please try again." });
  }
});

// ── Worker: verify registration OTP → account activated ──────────────
router.post("/worker/otp/verify", otpVerifyLimiter, async (req, res) => {
  try {
    const mobile = String(req.body.mobile_number || "").replace(/\D/g, "");
    const code = String(req.body.otp || "").replace(/\D/g, "");
    const result = await consumeOtp(mobile, code, "register");
    if (!result.ok) return res.status(400).json({ detail: result.reason });

    const worker = await User.findOne({ role: "worker", mobile_number: mobile });
    if (!worker) return res.status(404).json({ detail: "Registration not found." });

    worker.is_phone_verified = true;
    await worker.save();
    res.json({ access_token: signToken(worker), token_type: "bearer", worker: worker.toWorkerJSON() });
  } catch (err) {
    console.error("[auth/otp/verify]", err);
    res.status(500).json({ detail: "Verification failed. Please try again." });
  }
});

// ── Worker: OTP login — step 1 request ───────────────────────────────
router.post("/worker/login/otp/request", otpRequestLimiter, async (req, res) => {
  try {
    const mobile = String(req.body?.mobile_number || "").replace(/\D/g, "");
    if (!MOBILE_RE.test(mobile)) {
      return res.status(422).json({ detail: [{ loc: ["body", "mobile_number"], msg: "Enter a valid 10-digit Indian mobile number" }] });
    }
    // Never reveal whether the number is registered (enumeration defense).
    // The OTP itself is delivered via the backend terminal (dev/demo mode).
    const { wait } = await issueOtp(mobile, "login");
    await audit({
      actorRole: "worker", actorIdentifier: mobile, action: "worker.otp.request",
      resourceType: "user", resourceId: null, ip: req.ip, success: true,
    });
    res.json({ detail: "OTP sent" });
  } catch (err) {
    console.error("[auth/otp/request]", err);
    res.status(500).json({ detail: "Could not send OTP. Please try again." });
  }
});

// ── Worker: OTP login — step 2 verify ────────────────────────────────
router.post("/worker/login/otp", otpVerifyLimiter, async (req, res) => {
  try {
    const mobile = String(req.body.mobile_number || "").replace(/\D/g, "");
    const code = String(req.body.otp || "").replace(/\D/g, "");
    const result = await consumeOtp(mobile, code, "login");
    if (!result.ok) return res.status(400).json({ detail: result.reason });
    const worker = await User.findOne({ role: "worker", mobile_number: mobile });
    if (!worker) return res.status(404).json({ detail: "No account for this number." });
    if (!worker.is_phone_verified) {
      worker.is_phone_verified = true;
      await worker.save();
    }
    if (!worker.is_active) return res.status(403).json({ detail: "Account disabled." });
    res.json({ access_token: signToken(worker), token_type: "bearer", worker: worker.toWorkerJSON() });
  } catch (err) {
    console.error("[auth/otp/login]", err);
    res.status(500).json({ detail: "Login failed. Please try again." });
  }
});

// ── Worker: password login ───────────────────────────────────────────
router.post("/worker/login", workerLoginLimiter, async (req, res) => {
  try {
    const mobile = String(req.body.mobile_number || "").replace(/\D/g, "");
    const worker = await User.findOne({ role: "worker", mobile_number: mobile });
    const ok = worker?.password_hash ? await verifyPassword(String(req.body.password || ""), worker.password_hash) : false;
    if (!worker || !ok) {
      await audit({
        actorRole: "worker", actorIdentifier: mobile, action: "worker.login.password",
        resourceType: "user", resourceId: null, ip: req.ip, success: false, failureReason: "invalid credentials",
      });
      return res.status(401).json({ detail: "Invalid mobile number or password." });
    }
    if (!worker.is_active) return res.status(403).json({ detail: "Account disabled." });
    // An unverified account has no password login: it must complete OTP
    // verification first (register flow re-sends the code).
    if (!worker.is_phone_verified) {
      return res.status(403).json({ detail: "Account not verified. Please complete registration with the OTP sent to your mobile." });
    }
    res.json({ access_token: signToken(worker), token_type: "bearer", worker: worker.toWorkerJSON() });
  } catch (err) {
    console.error("[auth/worker/login]", err);
    res.status(500).json({ detail: "Login failed. Please try again." });
  }
});

// ── Worker: me / logout ──────────────────────────────────────────────
router.get("/worker/me", authenticate, requireWorker, async (req, res) => {
  const worker = await User.findById(req.userId);
  if (!worker || !worker.is_active) return res.status(401).json({ detail: "Not authenticated" });
  res.json(worker.toWorkerJSON());
});

router.post("/worker/logout", authenticate, (req, res) => res.json({ detail: "Logged out" }));

// ── Government login ─────────────────────────────────────────────────
router.post("/government/login", governmentLoginLimiter, async (req, res) => {
  try {
    const employeeId = String(req.body.employee_id || "").trim();
    const password = String(req.body.password || "");
    const official = await User.findOne({ role: "government", employee_id: employeeId });
    const ok = official?.password_hash ? await verifyPassword(password, official.password_hash) : false;
    if (!official || !ok) {
      await audit({
        actorRole: "government", actorIdentifier: employeeId, action: "government.login",
        resourceType: "user", resourceId: null, ip: req.ip, success: false, failureReason: "invalid credentials",
      });
      return res.status(401).json({ detail: "Invalid employee ID or password." });
    }
    if (!official.is_active) return res.status(403).json({ detail: "Account disabled." });
    await audit({
      actorRole: "government", actorIdentifier: employeeId, action: "government.login",
      resourceType: "user", resourceId: String(official._id), ip: req.ip, success: true,
    });
    res.json({ access_token: signToken(official), token_type: "bearer", government: official.toGovernmentJSON() });
  } catch (err) {
    console.error("[auth/gov/login]", err);
    res.status(500).json({ detail: "Login failed. Please try again." });
  }
});

// ── Government: me ───────────────────────────────────────────────────
router.get("/government/me", authenticate, requireGovernment, async (req, res) => {
  const official = await User.findById(req.userId);
  if (!official) return res.status(401).json({ detail: "Not authenticated" });
  res.json(official.toGovernmentJSON());
});

export default router;
