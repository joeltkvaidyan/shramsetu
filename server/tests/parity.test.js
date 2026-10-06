/**
 * Phase 6 feature tests — wage log (smallest versions).
 *
 * Covers:
 *  - wage upsert-by-date (no duplicates), validation (bad date, paid>agreed)
 *  - paid-day lock: an entry already fully paid can no longer be edited (409)
 *  - ownership: a worker cannot delete another worker's entry
 *  - government JWT → 403 on worker wage routes
 *  - summary totals (agreed / paid / unpaid)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import supertest from "supertest";
import crypto from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { WageEntry } from "../src/models/WageEntry.js";
import { hashPassword } from "../src/utils/crypto.js";

const api = supertest(app);

let mongod;
const P = { worker: "Worker@123", official: "Official@123" };
const ids = {};

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const loginAs = async (userId, role) => {
  const u = await User.findById(userId);
  const { signToken } = await import("../src/utils/crypto.js");
  return signToken({ _id: u._id, role: role || u.role, worker_id: u.worker_id, employee_id: u.employee_id });
};

async function makeUser(over = {}) {
  return User.create({
    role: over.role || "worker",
    full_name: over.full_name || "Test Worker",
    mobile_number: over.mobile_number || `9${crypto.randomInt(100000000, 999999999)}`,
    password_hash: await hashPassword(over.password || P.worker),
    is_phone_verified: true,
    is_active: true,
    ...(over.fields || {}),
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri("shramsetu-p6-test"));

  ids.superadmin = (
    await makeUser({
      full_name: "Super Admin",
      password: P.official,
      role: "government",
      fields: { employee_id: "SA001", is_superadmin: true, mobile_number: "9000000090" },
    })
  )._id;
  ids.stateKL = (
    await makeUser({
      full_name: "Kerala State Officer",
      password: P.official,
      role: "government",
      fields: { employee_id: "KL001", state: "Kerala", district: null, mobile_number: "9000000091" },
    })
  )._id;
  ids.distEKM = (
    await makeUser({
      full_name: "Ernakulam District Officer",
      password: P.official,
      role: "government",
      fields: { employee_id: "EKM001", state: "Kerala", district: "Ernakulam", mobile_number: "9000000092" },
    })
  )._id;
  ids.stateless = (
    await makeUser({
      full_name: "No Jurisdiction Officer",
      password: P.official,
      role: "government",
      fields: { employee_id: "NJ001", state: null, district: null, is_superadmin: false, mobile_number: "9000000093" },
    })
  )._id;

  ids.wEKM = (
    await makeUser({
      full_name: "Ernakulam Worker",
      fields: {
        current_state: "Kerala",
        current_district: "Ernakulam",
        emergency_contact_name: "Amma",
        emergency_contact_relation: "mother",
        emergency_contact_number: "9995500111",
      },
    })
  )._id;
  ids.wKozhikode = (
    await makeUser({ full_name: "Kozhikode Worker", fields: { current_state: "Kerala", current_district: "Kozhikode" } })
  )._id;
  ids.wTamil = (
    await makeUser({ full_name: "Tamil Worker", fields: { current_state: "Tamil Nadu", current_district: "Coimbatore" } })
  )._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ── Wage log ─────────────────────────────────────────────────────────
describe("Wage log", () => {
  it("upserts by date: same date twice updates instead of duplicating", async () => {
    const t = await loginAs(ids.wEKM);
    const body = { work_date: "2026-10-01", agreed_amount: 800, paid_amount: 0 };

    const first = await api.post("/api/v1/wages").set(auth(t)).send(body);
    expect(first.status).toBe(201);
    expect(first.body.payment_status).toBe("unpaid");

    const second = await api
      .post("/api/v1/wages")
      .set(auth(t))
      .send({ ...body, paid_amount: 500 });
    expect(second.status).toBe(201);
    expect(second.body.payment_status).toBe("partial");

    const list = await api.get("/api/v1/wages").set(auth(t));
    expect(list.body.entries).toHaveLength(1);
    expect(list.body.entries[0].paid_amount).toBe(500);
  });

  it("rejects a bad date and paid>agreed (422)", async () => {
    const t = await loginAs(ids.wEKM);
    expect((await api.post("/api/v1/wages").set(auth(t)).send({ work_date: "01-10-2026", agreed_amount: 100 })).status).toBe(422);
    expect(
      (await api.post("/api/v1/wages").set(auth(t)).send({ work_date: "2026-10-02", agreed_amount: 100, paid_amount: 200 })).status
    ).toBe(422);
  });

  it("summary computes agreed/paid/unpaid", async () => {
    const t = await loginAs(ids.wEKM);
    const s = await api.get("/api/v1/wages/summary").set(auth(t));
    expect(s.status).toBe(200);
    expect(s.body.days_logged).toBe(1);
    expect(s.body.total_agreed).toBe(800);
    expect(s.body.total_paid).toBe(500);
    expect(s.body.total_unpaid).toBe(300);
  });

  it("locks a fully paid day: further edits to that date are rejected (409)", async () => {
    const t = await loginAs(ids.wEKM);
    const body = { work_date: "2026-10-01", agreed_amount: 800, paid_amount: 800 };

    // Final settlement: partial → paid is allowed.
    const settle = await api.post("/api/v1/wages").set(auth(t)).send(body);
    expect(settle.status).toBe(201);
    expect(settle.body.payment_status).toBe("paid");

    // Any later edit of that same day is refused.
    const edit = await api
      .post("/api/v1/wages")
      .set(auth(t))
      .send({ ...body, paid_amount: 100 });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe("wage_paid_locked");

    // The stored entry still reads paid_amount=800.
    const stored = await WageEntry.findById(settle.body.id);
    expect(stored.paid_amount).toBe(800);
  });

  it("worker cannot delete another worker's entry (404, no leak)", async () => {
    const mine = await WageEntry.findOne({ worker_id: ids.wEKM });
    const other = await loginAs(ids.wKozhikode);
    const r = await api.delete(`/api/v1/wages/${mine._id}`).set(auth(other));
    expect(r.status).toBe(404);
    expect(await WageEntry.findById(mine._id)).not.toBeNull();
  });

  it("government JWT gets 403 on worker wage routes", async () => {
    const gt = await loginAs(ids.distEKM);
    expect((await api.get("/api/v1/wages").set(auth(gt))).status).toBe(403);
    expect((await api.post("/api/v1/wages").set(auth(gt)).send({ work_date: "2026-10-03", agreed_amount: 1 })).status).toBe(403);
  });
});

