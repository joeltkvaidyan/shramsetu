import fs from "node:fs";
import { config, assertProductionSafe } from "./config.js";
import { connectDB } from "./db.js";
import { User } from "./models/User.js";
import { hashPassword } from "./utils/crypto.js";
import { seedDemoData } from "./seed/seed.js";
import app from "./app.js";

assertProductionSafe();

async function bootstrap() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await connectDB();

  // Bootstrap government superadmin — CREATE ONLY. The password is never
  // reset here: an attacker who can restart the server must not be able to
  // take over an admin account whose password was changed.
  const adminId = config.bootstrapAdmin.employeeId;
  const existing = await User.findOne({ role: "government", employee_id: adminId });
  if (!existing) {
    await User.create({
      role: "government",
      employee_id: adminId,
      full_name: "ShramSetu Superadmin",
      mobile_number: "9000000000",
      email: null,
      password_hash: await hashPassword(config.bootstrapAdmin.password),
      department: "Labour Department",
      designation: "Commissioner",
      state: null,
      district: null,
      is_superadmin: true,
      is_active: true,
    });
    console.log(`[bootstrap] admin created: ${adminId}`);
  } else {
    console.log(`[bootstrap] admin exists: ${adminId} (password not modified)`);
  }

  if (config.seedDemoData) {
    await seedDemoData();
  }

  const server = app.listen(config.port, () => {
    console.log(`[server] ShramSetu Node API on http://127.0.0.1:${config.port} (env=${config.env})`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[server] Port ${config.port} is already in use — another ShramSetu API instance is likely running.\n` +
        `         Find it:   netstat -ano | findstr :${config.port}\n` +
        `         Stop it:   taskkill /PID <pid> /F\n` +
        `         (Under 'npm run dev', save a file afterwards to retry.)`
      );
    } else {
      console.error("[server] listen error:", err);
    }
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});
