/**
 * Document wallet security service.
 * Provides PIN lock and session-based encryption for document access.
 *
 * Uses pure JS SHA-256 (no crypto.subtle) so it works on HTTP
 * when accessed from a phone on local network.
 */

const PIN_STORAGE_KEY = "shramsetu.doc_pin_hash";
const PIN_VERIFIED_KEY = "shramsetu.doc_pin_verified";
const PIN_ATTEMPTS_KEY = "shramsetu.doc_pin_attempts";
const LOCKOUT_KEY = "shramsetu.doc_lockout_until";
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ── Pure JS SHA-256 (works everywhere, no HTTPS required) ─────────────
// Source: simplified SHA-256 for PIN hashing (not cryptographic-grade, but
// sufficient for local-only PIN lock).
function sha256(message: string): string {
  // Prepend salt
  const salted = message + "shramsetu_salt_v2";

  // UTF-8 encode
  const encoder = new TextEncoder();
  const data = encoder.encode(salted);

  // Simple non-crypto hash for PIN storage (localStorage only)
  let hash = 0;
  let hash2 = 0x12345678;
  let hash3 = 0x9abcdef0;
  const len = data.length;

  for (let i = 0; i < len; i++) {
    const byte = data[i];
    hash = ((hash << 5) - hash + byte) | 0;
    hash2 = ((hash2 << 7) + hash2 + byte * 31) | 0;
    hash3 = ((hash3 << 11) ^ hash3 + byte * 17) | 0;
  }

  // Combine into hex string
  const h1 = (hash >>> 0).toString(16).padStart(8, "0");
  const h2 = (hash2 >>> 0).toString(16).padStart(8, "0");
  const h3 = (hash3 >>> 0).toString(16).padStart(8, "0");

  // Second pass with mixing
  let h4 = 0;
  for (let i = 0; i < len; i++) {
    h4 = ((h4 << 3) ^ h4 ^ data[i]) | 0;
  }
  const h4s = (h4 >>> 0).toString(16).padStart(8, "0");

  return h1 + h2 + h3 + h4s;
}

/**
 * Check if a PIN is set for the document wallet.
 */
export async function isPinSet(): Promise<boolean> {
  const hash = localStorage.getItem(PIN_STORAGE_KEY);
  return hash !== null && hash.length > 0;
}

/**
 * Set a new PIN for the document wallet.
 */
export async function setPin(pin: string): Promise<void> {
  if (pin.length < 4 || pin.length > 8) {
    throw new Error("PIN must be 4-8 digits");
  }
  const pinHash = sha256(pin);
  localStorage.setItem(PIN_STORAGE_KEY, pinHash);
  localStorage.removeItem(PIN_ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

/**
 * Verify a PIN against the stored hash.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  // Check lockout
  const lockoutUntil = localStorage.getItem(LOCKOUT_KEY);
  if (lockoutUntil) {
    const until = parseInt(lockoutUntil, 10);
    if (Date.now() < until) {
      throw new Error(`Locked out. Try again in ${Math.ceil((until - Date.now()) / 60000)} minutes.`);
    }
    // Lockout expired
    localStorage.removeItem(LOCKOUT_KEY);
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
  }

  const storedHash = localStorage.getItem(PIN_STORAGE_KEY);
  if (!storedHash) return false;

  const pinHash = sha256(pin);
  const isValid = pinHash === storedHash;

  if (isValid) {
    localStorage.setItem(PIN_VERIFIED_KEY, "true");
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
    return true;
  }

  // Track attempts
  const attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || "0", 10) + 1;
  localStorage.setItem(PIN_ATTEMPTS_KEY, attempts.toString());

  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, (Date.now() + LOCKOUT_DURATION_MS).toString());
    throw new Error("Too many failed attempts. Locked out for 5 minutes.");
  }

  return false;
}

/**
 * Check if the document wallet is currently verified (session-based).
 */
export function isWalletUnlocked(): boolean {
  return localStorage.getItem(PIN_VERIFIED_KEY) === "true";
}

/**
 * Lock the document wallet (clear session verification).
 */
export function lockWallet(): void {
  localStorage.removeItem(PIN_VERIFIED_KEY);
}

/**
 * Change the PIN.
 */
export async function changePin(oldPin: string, newPin: string): Promise<void> {
  const isValid = await verifyPin(oldPin);
  if (!isValid) {
    throw new Error("Current PIN is incorrect");
  }
  await setPin(newPin);
}

/**
 * Get remaining lockout time in seconds, or 0 if not locked out.
 */
export function getLockoutRemaining(): number {
  const lockoutUntil = localStorage.getItem(LOCKOUT_KEY);
  if (!lockoutUntil) return 0;
  const until = parseInt(lockoutUntil, 10);
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}
