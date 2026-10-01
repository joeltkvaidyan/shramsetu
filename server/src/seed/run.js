/** Standalone seeder entry: `npm run seed`.
 * Connects to the configured MongoDB (embedded in dev), seeds the demo
 * dataset if empty, then disconnects.
 */
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import { seedDemoData } from "./seed.js";

const main = async () => {
  await connectDB();
  await seedDemoData();
  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
