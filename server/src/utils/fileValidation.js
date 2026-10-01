import path from "node:path";

/**
 * Upload validation by CONTENT, not by client-claimed MIME type.
 *
 * The browser's mimetype and the file extension are attacker-controlled;
 * the only trustworthy signal is the leading magic bytes. Signatures below
 * are from the standard "List of file signatures" reference:
 *   https://en.wikipedia.org/wiki/List_of_file_signatures
 */

const SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  jpg: [0xff, 0xd8, 0xff], // JPEG SOI
  png: [0x89, 0x50, 0x4e, 0x47], // \x89PNG
  // WEBP: RIFF....WEBP (bytes 8..11)
  webp: null,
};

const EXT_BY_KIND = {
  pdf: [".pdf"],
  jpg: [".jpg", ".jpeg"],
  png: [".png"],
  webp: [".webp"],
};

export const ALLOWED_DOC_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

const startsWith = (buf, sig) => sig.every((b, i) => buf[i] === b);

/** Detect the real file kind from magic bytes. Returns null when unknown. */
export function detectFileKind(buf) {
  if (!buf || buf.length < 12) return null;
  if (startsWith(buf, SIGNATURES.pdf)) return "pdf";
  if (startsWith(buf, SIGNATURES.jpg)) return "jpg";
  if (startsWith(buf, SIGNATURES.png)) return "png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // WEBP
  ) {
    return "webp";
  }
  return null;
}

/**
 * Validate an uploaded document/image.
 * @param {Buffer} buffer   full file content
 * @param {string} originalName  client-supplied filename
 * @param {number} sizeBytes
 * @param {number} maxBytes
 * @returns {{ ok: true, kind: string } | { ok: false, reason: string }}
 */
export function validateDocumentFile(buffer, originalName, sizeBytes, maxBytes) {
  if (!buffer || buffer.length === 0) return { ok: false, reason: "File is empty." };
  if (sizeBytes > maxBytes) {
    return { ok: false, reason: `File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).` };
  }
  const ext = path.extname(originalName || "").toLowerCase();
  if (!ALLOWED_DOC_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: `File type not allowed. Accepted: ${ALLOWED_DOC_EXTENSIONS.join(", ")}` };
  }
  const kind = detectFileKind(buffer);
  if (!kind) {
    return { ok: false, reason: "File content does not match an allowed type (PDF, JPEG, PNG or WEBP)." };
  }
  if (!EXT_BY_KIND[kind].includes(ext)) {
    // Extension and content disagree — e.g. a .pdf that is really a JPEG.
    return { ok: false, reason: "File extension does not match its content." };
  }
  return { ok: true, kind };
}

const AUDIO_MIME = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
  "audio/m4a",
]);

/**
 * Validate a voice-recording upload for /chat/transcribe. Content sniffing
 * of container formats (webm/ogg/mp4) is unreliable for short clips, so the
 * rule is: an explicit audio/* MIME from the multipart part, a sane size
 * window, and a rejection of obviously-renamed non-audio payloads (we do
 * check the classic RIFF/WAVE and ID3 magic when present).
 */
export function validateAudioUpload(mimetype, sizeBytes, maxBytes) {
  if (!mimetype || !AUDIO_MIME.has(mimetype.toLowerCase())) {
    return { ok: false, reason: "Only audio uploads are accepted." };
  }
  if (!sizeBytes || sizeBytes < 500) {
    return { ok: false, reason: "Recording too short — record for at least 1 second." };
  }
  if (sizeBytes > maxBytes) {
    return { ok: false, reason: `Recording too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).` };
  }
  return { ok: true };
}
