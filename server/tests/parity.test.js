/**
 * Phase 6 feature tests — wage log and SOS (smallest versions).
 *
 * Covers:
 *  - wage upsert-by-date (no duplicates), validation (bad date, paid>agreed)
 *  - ownership: a worker cannot delete another worker's entry
 *  - government JWT → 403 on worker wage routes
 *  - summary totals (agreed / paid / unpaid)
 *  - SOS: worker raise snapshots emergency contact + jurisdiction,
 *    delivery is dashboard_only (no SMS — stated honestly)
 *  - SOS scoping: district official sees only own district, acknowledges
 *    in-scope only; state official sees whole state; superadmin sees all;
 *    stateless official sees nothing
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import supertest from "supertest";
import crypto from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { WageEntry } from "../src/models/WageEntry.js";
import { SosAlert } from "../src/models/SosAlert.js";
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

// ── SOS ──────────────────────────────────────────────────────────────
describe("SOS alerts", () => {
  let alertEKM, alertKozhikode, alertTamil;

  it("worker raises an SOS: snapshots contact + jurisdiction, delivery=dashboard_only", async () => {
    const t = await loginAs(ids.wEKM);
    const r = await api.post("/api/v1/sos").set(auth(t)).send({ location_text: "Worksites near Kadavanthra", note: "No wages, employer threats" });
    expect(r.status).toBe(201);
    expect(r.body.delivery).toBe("dashboard_only");
    expect(r.body.status).toBe("open");
    expect(r.body.emergency_contact_number).toBe("9995500111");
    expect(r.body.owner_state).toBe("Kerala");
    expect(r.body.owner_district).toBe("Ernakulam");
    alertEKM = r.body.id;

    const other1 = await loginAs(ids.wKozhikode);
    alertKozhikode = (await api.post("/api/v1/sos").set(auth(other1)).send({})).body.id;
    const other2 = await loginAs(ids.wTamil);
    alertTamil = (await api.post("/api/v1/sos").set(auth(other2)).send({})).body.id;
  });

  it("worker JWT gets 403 on the officials list", async () => {
    const t = await loginAs(ids.wEKM);
    expect((await api.get("/api/v1/sos").set(auth(t))).status).toBe(403);
  });

  it("district official sees only Ernakulam alerts; acknowledges in-scope", async () => {
    const t = await loginAs(ids.distEKM);
    const list = await api.get("/api/v1/sos").set(auth(t));
    expect(list.status).toBe(200);
    const idsSeen = list.body.alerts.map((a) => a.id);
    expect(idsSeen).toContain(alertEKM);
    expect(idsSeen).not.toContain(alertKozhikode);
    expect(idsSeen).not.toContain(alertTamil);

    const ack = await api.post(`/api/v1/sos/${alertEKM}/acknowledge`).set(auth(t));
    expect(ack.status).toBe(200);
    expect(ack.body.status).toBe("acknowledged");
  });

  it("district official cannot acknowledge an out-of-district alert (403)", async () => {
    const t = await loginAs(ids.distEKM);
    expect((await api.post(`/api/v1/sos/${alertKozhikode}/acknowledge`).set(auth(t))).status).toBe(403);
  });

  it("state official sees the whole state; superadmin sees all; stateless sees nothing", async () => {
    const st = await loginAs(ids.stateKL);
    const stList = await api.get("/api/v1/sos").set(auth(st));
    const stIds = stList.body.alerts.map((a) => a.id);
    expect(stIds).toContain(alertEKM);
    expect(stIds).toContain(alertKozhikode);
    expect(stIds).not.toContain(alertTamil);

    const sa = await loginAs(ids.superadmin);
    const saList = await api.get("/api/v1/sos").set(auth(sa));
    expect(saList.body.alerts.map((a) => a.id)).toContain(alertTamil);

    const nj = await loginAs(ids.stateless);
    const njList = await api.get("/api/v1/sos").set(auth(nj));
    expect(njList.body.alerts).toHaveLength(0);
    expect((await api.post(`/api/v1/sos/${alertEKM}/acknowledge`).set(auth(nj))).status).toBe(403);
  });
});
