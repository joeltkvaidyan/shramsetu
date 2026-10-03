/**
 * Demo reset — put the database back to a known, presentable state.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every demo run mutates the database: a grievance is filed, a wage entry is
 * logged, an SOS is raised and acknowledged, a notification is sent. Run the
 * demo twice and the second run opens onto last week's data — the grievance
 * count is wrong, the wage diary already has rows, and the "only 2 construction
 * workers" targeting demo no longer demonstrates anything because the audience
 * has already seen the result. The original workaround (restart with the
 * embedded DB) only works while MONGODB_URI=memory; against a real MongoDB the
 * data persists and the demo drifts.
 *
 * `seedDemoData` is deliberately create-only — it refuses to overwrite existing
 * workers, which is correct for a server boot. That same behaviour is exactly
 * what makes it useless for resetting, so this script deletes first and then
 * hands over to the same seeder. One source of truth for what "the demo data"
 * is: the seeder.
 *
 * WHAT IT DOES AND DOES NOT DELETE
 * --------------------------------
 * Deletes: workers and everything they own (grievances, wage entries, SOS
 * alerts, chat history, notifications, wallet document metadata).
 * Keeps:    government officials and the bootstrap admin. Logins must survive a
 *           reset, and these are create-only/never-overwritten rows anyway.
 * Also clears OtpCode, so a half-finished OTP from a previous run cannot block
 * the demo login (the 60s resend cooldown is the usual cause).
 *
 * SAFETY
 * ------
 * Refuses to run when ENV=production. Without --yes it asks first and prints
 * exactly what will be deleted. With MONGODB_URI=memory it explains that there
 * is nothing to reset (the embedded database is fresh on every boot) instead of
 * silently doing nothing.
 */
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { connectDB } from "../src/db.js";
import { seedDemoData } from "../src/seed/seed.js";
import { User } from "../src/models/User.js";
import { Grievance } from "../src/models/Grievance.js";
import { WageEntry } from "../src/models/WageEntry.js";
import { SosAlert } from "../src/models/SosAlert.js";
import {
  Document,
  OtpCode,
  ChatMessage,
} from "../src/models/Document.js";
import { PushNotification, WorkerNotification } from "../src/models/Notification.js";

const yes = process.argv.includes("--yes") || process.argv.includes("-y");

// Deleting "owned" data by role: workers are the demo actors. Officials are
// deliberately excluded so the government portal keeps working after a reset.
// AuditLog is deliberately NOT in this list: wiping an audit trail is exactly
// the behaviour an audit trail exists to detect, and a demo reset has no reason
// to destroy one.
const owned = [
  ["Grievance", Grievance],
  ["WageEntry", WageEntry],
  ["SosAlert", SosAlert],
  ["ChatMessage", ChatMessage],
  ["Document", Document],
  ["WorkerNotification", WorkerNotification],
  ["PushNotification", PushNotification],
  ["OtpCode", OtpCode],
];

async function main() {
  if (config.env === "production") {
    console.error(
      "[reset-demo] REFUSED: ENV=production. This script exists to reset the " +
        "presentation dataset; running it against production would destroy real " +
        "worker records. Set ENV=development (or unset it) to proceed.",
    );
    process.exit(1);
  }

  if (config.mongodbUri === "memory") {
    console.log(
      "[reset-demo] MONGODB_URI=memory — this dev database is created fresh on " +
        "every server boot and dies with the process, so there is nothing to " +
        "reset. Just restart the server (stop-all.ps1, then start-all.ps1) for a " +
        "clean demo dataset.\n" +
        "To use this script, point MONGODB_URI at a real MongoDB instance.",
    );
    process.exit(0);
  }

  await connectDB();

  const workerCount = await User.countDocuments({ role: "worker" });
  const grievanceCount = await Grievance.countDocuments();

  if (!yes) {
    console.log("[reset-demo] ABOUT TO DELETE:");
    console.log(`  - ${workerCount} worker accounts`);
    for (const [name, Model] of owned) {
      console.log(`  - ${await Model.countDocuments()} ${name}`);
    }
    console.log("  - all OTPs and the broadcast notification");
    console.log("[reset-demo] Government officials and the bootstrap admin are KEPT.");
    if (workerCount === 0 && grievanceCount === 0) {
      console.log("[reset-demo] Nothing to delete (database already empty).");
      await mongoose.disconnect();
      process.exit(0);
    }
    const answer = process.stdin.isTTY
      ? await ask("Type 'reset' to continue: ")
      : "no";
    if (String(answer).trim().toLowerCase() !== "reset") {
      console.log("[reset-demo] Cancelled — nothing was deleted.");
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  const deleted = [];
  for (const [name, Model] of owned) {
    const result = await Model.deleteMany({});
    if (result.deletedCount) deleted.push(`${name}: ${result.deletedCount}`);
  }
  const workers = await User.deleteMany({ role: "worker" });

  // Wallet files on disk are orphaned once the metadata rows are gone.
  console.log(
    `[reset-demo] deleted ${workers.deletedCount} workers` +
      (deleted.length ? `, ${deleted.join(", ")}` : ""),
  );

  await seedDemoData();

  const after = {
    workers: await User.countDocuments({ role: "worker" }),
    grievances: await Grievance.countDocuments(),
    officials: await User.countDocuments({ role: "government" }),
  };
  console.log(
    `[reset-demo] ready: ${after.workers} workers, ${after.grievances} grievances, ` +
      `${after.officials} officials kept.`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

function ask(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once("data", (d) => resolve(d.toString()));
  });
}

main().catch((err) => {
  console.error("[reset-demo] failed:", err);
  process.exit(1);
});