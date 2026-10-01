/** End-to-end verification of the ShramSetu Node+Mongo+AI stack.
 * Run: `npm run verify` (from server/) — services must be on :8000/:8100.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Dev OTP log the backend appends to on every send (server/logs/otp-dev.log).
// Asserting on THIS run's OTP — not stale terminal output from earlier runs.
const otpLog = fileURLToPath(new URL("../logs/otp-dev.log", import.meta.url));

const B = "http://127.0.0.1:8000/api/v1";
const results = [];
const check = (name, ok, extra = "") => results.push([ok ? "PASS" : "FAIL", name, extra]);
const jsonHeaders = { "Content-Type": "application/json" };

// ── 1. Government login ──────────────────────────────────────────────
let r = await fetch(`${B}/auth/government/login`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ employee_id: "ADMIN001", password: "Admin@123" }) });
check("government login", r.status === 200);
const gov = await r.json();
const gt = { Authorization: `Bearer ${gov.access_token}` };

r = await fetch(`${B}/auth/government/me`, { headers: gt });
check("government /me", (await r.json()).employee_id === "ADMIN001");

// ── 2. Dashboard stats ───────────────────────────────────────────────
const stats = await (await fetch(`${B}/government/dashboard/stats`, { headers: gt })).json();
check("stats: 10 workers", stats.total_workers === 10, `got ${stats.total_workers}`);
check("stats: ≥11 grievances (seeded)", stats.total_grievances >= 11, `got ${stats.total_grievances}`);
check("stats: workers_by_state grouped", JSON.stringify(stats.workers_by_state).includes("Kerala"), JSON.stringify(stats.workers_by_state));

// ── 3. Workers list ──────────────────────────────────────────────────
const wl = await (await fetch(`${B}/government/workers`, { headers: gt })).json();
check("workers list total=10", wl.total === 10 && String(wl.workers[0].worker_id || "").startsWith("SS-"));

// ── 4. Worker OTP flow (TERMINAL delivery — never in API responses) ─
// Snapshot the OTP log before requesting, then diff to get THIS run's code.
const readOtpLog = () => {
  try { return readFileSync(otpLog, "utf8"); } catch { return ""; }
};
const logBefore = readOtpLog();
r = await fetch(`${B}/auth/worker/login/otp/request`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ mobile_number: "9555500101" }) });
const otpResp = await r.json();
check("OTP request does NOT echo the code", r.status === 200 && otpResp.dev_otp === undefined, JSON.stringify(otpResp));

await new Promise((res) => setTimeout(res, 300)); // flush window
const logAfter = readOtpLog();
const newOtpLines = logAfter
  .slice(logBefore.length)
  .split("\n")
  .filter((line) => line.includes("+91 9555500101"));
const otpMatch = newOtpLines.join("\n").match(/OTP (\d{6})/);
const otpCode = otpMatch?.[1] || "";
check("OTP printed in backend TERMINAL log", Boolean(otpCode), `found ${newOtpLines.length} new line(s)`);

r = await fetch(`${B}/auth/worker/login/otp`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ mobile_number: "9555500101", otp: otpCode }) });
const login = await r.json();
const wh = { Authorization: `Bearer ${login.access_token}`, ...jsonHeaders };
check("OTP verify → JWT", Boolean(login.access_token));

const me = await (await fetch(`${B}/auth/worker/me`, { headers: wh })).json();
check("/me is Ramesh Kumar", me.full_name === "Ramesh Kumar" && String(me.worker_id).startsWith("SS-"));

// ── 5. Password login ────────────────────────────────────────────────
r = await fetch(`${B}/auth/worker/login`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ mobile_number: "9555500103", password: "Worker@123" }) });
check("password login (Imran, Worker@123)", r.status === 200);

// ── 6. Grievances ────────────────────────────────────────────────────
const gl = await (await fetch(`${B}/grievances?limit=100`, { headers: wh })).json();
check("Ramesh has ≥2 grievances", Array.isArray(gl) && gl.length >= 2, `got ${gl.length}`);

r = await fetch(`${B}/grievances`, { method: "POST", headers: wh, body: JSON.stringify({ category: "unpaid_wages", subject: "Verification test grievance", description: "Created by automated verification, withdrawn right after." }) });
const created = await r.json();
check("create grievance (auto GR-number, priority, SLA)", r.status === 201 && String(created.complaint_number).startsWith("GR-") && Boolean(created.sla_deadline));

r = await fetch(`${B}/grievances/${created.id}/withdraw`, { method: "POST", headers: wh });
check("withdraw grievance", r.status === 200);

// ── 7. Notifications: gov → workers round trip ───────────────────────
r = await fetch(`${B}/government/notifications/send`, { method: "POST", headers: { ...gt, ...jsonHeaders }, body: JSON.stringify({ title: "Verification notice", body: "Automated targeting check", priority: "medium", target: "occupation", target_value: "construction" }) });
const sent = await r.json();
check("targeted send → exactly 2 construction workers", r.status === 201 && sent.sent_count === 2, JSON.stringify(sent));

const uc = await (await fetch(`${B}/notifications/unread-count`, { headers: wh })).json();
check("worker unread ≥ 2 (broadcast + targeted)", uc.unread_count >= 2, `unread=${uc.unread_count}`);

const inbox = (await (await fetch(`${B}/notifications/my`, { headers: wh })).json()).notifications;
check("inbox joined shape", inbox.length > 0 && inbox[0].title && "is_read" in inbox[0]);

await fetch(`${B}/notifications/${inbox[0].id}/read`, { method: "POST", headers: wh });
const uc2 = await (await fetch(`${B}/notifications/unread-count`, { headers: wh })).json();
check("mark-read decrements badge", uc2.unread_count === uc.unread_count - 1, `${uc.unread_count}→${uc2.unread_count}`);

// ── 8. Document wallet: encrypt → download round trip ────────────────
const pdf = Buffer.from("%PDF-1.4 ShramSetu verification document");
const form = new FormData();
form.append("file", new Blob([pdf], { type: "application/pdf" }), "test.pdf");
form.append("display_name", "Verify Doc");
r = await fetch(`${B}/documents`, { method: "POST", headers: { Authorization: wh.Authorization }, body: form });
const doc = await r.json();
check("document upload (AES encrypted at rest)", r.status === 201 && doc.size_bytes === pdf.length);

const dl = await fetch(`${B}/documents/${doc.id}/download`, { headers: wh });
check("document download decrypts correctly", dl.status === 200 && (await dl.text()).startsWith("%PDF-1.4"));

r = await fetch(`${B}/documents/${doc.id}`, { method: "DELETE", headers: wh });
check("document delete", r.status === 200);

// ── 9. AI assistant via Node proxy ───────────────────────────────────
// Health first, so a down AI service fails HERE with a clear message
// instead of quietly passing on the Node server's fallback reply.
let aiUp = false;
try {
  aiUp = (await (await fetch("http://127.0.0.1:8100/health")).json())?.status === "ok";
} catch { /* unreachable */ }
check("ai-service health on :8100", aiUp, aiUp ? "" : "START IT: cd ai-service && venv/Scripts/python -m uvicorn main:app --host 127.0.0.1 --port 8100");

r = await fetch(`${B}/chat/ask`, { method: "POST", headers: wh, body: JSON.stringify({ question: "How do I register for e-Shram?", language: "en" }) });
const ans = await r.json();
// A 200 with system_error=true is the Node fallback reply for a dead AI
// service — that must FAIL verification, not pass as "graceful".
const aiAnswered = r.status === 200 && typeof ans.answer === "string" && ans.grounded === true && ans.system_error === false;
check("chat/ask grounded answer (AI reachable, Groq key OK)", aiAnswered, `grounded=${ans.grounded} system_error=${ans.system_error}${aiUp ? " (Groq key/model issue?)" : " (AI service down)"}`);

const hist = await (await fetch(`${B}/chat/history`, { headers: wh })).json();
check("chat history persisted (user+assistant)", hist.length >= 2 && hist[hist.length - 1].role === "assistant", `${hist.length} rows`);

// ── 10. TTS through the proxy (Sarvam/Google audio) ──────────────
r = await fetch(`${B}/chat/speak?text=${encodeURIComponent("Hello, this is ShramSetu.")}&language=en`, { headers: wh });
const ct = r.headers.get("content-type") || "";
const bytes = (await r.arrayBuffer()).byteLength;
check("chat/speak returns audio", r.status === 200 && ct.startsWith("audio/") && bytes > 10000, `${ct} ${bytes}B`);

console.log(results.map((x) => x.join("  ")).join("\n"));
const fails = results.filter((x) => x[0] === "FAIL").length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
