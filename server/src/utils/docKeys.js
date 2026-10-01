import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Document-wallet key wrapping.
 *
 * Before: the per-file AES-256-GCM key sat in MongoDB in plaintext next to
 * the file metadata — anyone with a DB dump could decrypt every wallet file.
 *
 * Now: each per-file key is itself encrypted (wrapped) with AES-256-GCM
 * under a master key from DOC_MASTER_KEY (32 bytes, base64). The master key
 * lives ONLY in the environment (production refuses to start without it —
 * see config.js), so a stolen DB dump alone no longer decrypts documents.
 *
 * Storage format in Document.encryption_key:
 *   "wrapped:v1:" + base64(iv(12) || tag(16) || ciphertext)
 * Legacy plaintext rows start with anything else and are migrated by
 * scripts/migrate-doc-keys.mjs.
 */

const PREFIX = "wrapped:v1:";

function masterKey() {
  const raw = config.docMasterKey; // Buffer | null (validated in config.js)
  if (!raw) {
    throw new Error(
      "DOC_MASTER_KEY is not set — document encryption keys cannot be wrapped. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return raw;
}

/** Wrap a freshly-generated per-file key. Returns the stored string. */
export function wrapKey(perFileKeyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(perFileKeyBuf), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Unwrap a stored key string back to the raw 32-byte per-file key. */
export function unwrapKey(stored) {
  if (typeof stored !== "string" || !stored.startsWith(PREFIX)) {
    // Legacy plaintext base64 key — return as-is (migration handles these).
    return Buffer.from(stored, "base64");
  }
  const blob = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export const isWrappedKey = (stored) => typeof stored === "string" && stored.startsWith(PREFIX);
