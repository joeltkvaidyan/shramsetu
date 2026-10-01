#!/usr/bin/env node
/**
 * One-off migration: wrap legacy plaintext per-file AES keys in the
 * document wallet with DOC_MASTER_KEY (AES-256-GCM key wrapping).
 *
 * Run once from server/:
 *   node scripts/migrate-doc-keys.mjs
 * (reads DOC_MASTER_KEY from server/.env or the environment)
 *
 * Safe to re-run: rows already stored as "wrapped:v1:..." are skipped.
 * Without DOC_MASTER_KEY the script refuses to touch the database
 * (wrapping with a missing key would produce unusable rows).
 */
import mongoose from "mongoose";
import { connectDB } from "../src/db.js";
import { Document } from "../src/models/Document.js";
import { wrapKey, isWrappedKey } from "../src/utils/docKeys.js";
import { config } from "../src/config.js";

async function main() {
  if (!config.docMasterKey) {
    console.error(
      "DOC_MASTER_KEY is not set. Generate one first:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"\n' +
        "…then put it in server/.env and re-run this script."
    );
    process.exit(1);
  }

  await connectDB();

  const rows = await Document.find({ encryption_key: { $exists: true, $ne: null } });
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of rows) {
    try {
      if (isWrappedKey(doc.encryption_key)) {
        skipped += 1;
        continue;
      }
      // Legacy row: encryption_key is the raw base64 per-file key.
      const raw = Buffer.from(doc.encryption_key, "base64");
      if (raw.length !== 32) {
        console.warn(`  ! doc ${doc._id}: unexpected key length ${raw.length} — leaving untouched (NEEDS REVIEW)`);
        failed += 1;
        continue;
      }
      doc.encryption_key = wrapKey(raw);
      await doc.save();
      migrated += 1;
    } catch (err) {
      console.error(`  ! doc ${doc._id}: ${err.message}`);
      failed += 1;
    }
  }

  console.log(`[migrate-doc-keys] done: ${migrated} wrapped, ${skipped} already wrapped, ${failed} need review.`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("[migrate-doc-keys] fatal:", err);
  process.exit(1);
});
