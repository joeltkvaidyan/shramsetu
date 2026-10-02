import { Router } from "express";
import { User } from "../models/User.js";
import { SosAlert } from "../models/SosAlert.js";
import { authenticate, requireWorker, requireGovernment, audit } from "../middleware/auth.js";
import { grievanceScopeFilter } from "../utils/scope.js";

const router = Router();

// ── Worker raises an SOS ─────────────────────────────────────────────
// Dashboard-delivery only: the alert is stored and shown to officials in
// the worker's jurisdiction. No SMS/phone/push is ever sent — the UI must
// keep saying this (docs/FEATURE_PARITY.md, proposal 1).
router.post("/", authenticate, requireWorker, async (req, res) => {
  try {
    const worker = await User.findById(req.userId).select(
      "full_name mobile_number current_state current_district emergency_contact_name emergency_contact_relation emergency_contact_number"
    );
    if (!worker) return res.status(404).json({ detail: "Worker not found" });

    const { location_text, note } = req.body || {};

    const alert = await SosAlert.create({
      worker_id: worker._id,
      worker_name: worker.full_name,
      worker_mobile: worker.mobile_number,
      owner_state: worker.current_state || null,
      owner_district: worker.current_district || null,
      location_text: location_text ? String(location_text).slice(0, 200) : null,
      note: note ? String(note).slice(0, 500) : null,
      status: "open",
      emergency_contact_name: worker.emergency_contact_name || null,
      emergency_contact_relation: worker.emergency_contact_relation || null,
      emergency_contact_number: worker.emergency_contact_number || null,
    });

    await audit({
      actorRole: "worker",
      actorIdentifier: req.userId,
      action: "sos.raise",
      resourceType: "sos_alert",
      resourceId: String(alert._id),
      ip: req.ip,
      success: true,
    });

    res.status(201).json({
      ...alert.toJSON(),
      // Repeated so the client can show the honest delivery statement.
      delivery: "dashboard_only",
    });
  } catch (err) {
    console.error("[sos/raise]", err);
    res.status(500).json({ detail: "Could not raise the SOS alert." });
  }
});

// ── Officials: scoped list of alerts (newest first) ──────────────────
router.get("/", authenticate, requireGovernment, async (req, res) => {
  try {
    const official = await User.findById(req.userId);
    if (!official) return res.status(404).json({ detail: "Official not found" });

    // Same jurisdiction filter as grievances — SosAlert reuses the
    // owner_state/owner_district convention, so scoping is identical
    // (fail-closed for officials with no state).
    const { grievanceFilter } = await grievanceScopeFilter(official);
    const alerts = await SosAlert.find(grievanceFilter).sort({ createdAt: -1 }).limit(100);
    res.json({ alerts: alerts.map((a) => a.toJSON()) });
  } catch (err) {
    console.error("[sos/list]", err);
    res.status(500).json({ detail: "Could not load SOS alerts." });
  }
});

// ── Officials: acknowledge an alert (scope-checked) ──────────────────
router.post("/:id/acknowledge", authenticate, requireGovernment, async (req, res) => {
  try {
    const official = await User.findById(req.userId);
    if (!official) return res.status(404).json({ detail: "Official not found" });

    const alert = await SosAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ detail: "Alert not found" });

    // Per-document scope check (same rule as grievance detail access).
    const { grievanceFilter } = await grievanceScopeFilter(official);
    const visible = await SosAlert.findOne({ _id: alert._id, ...grievanceFilter });
    if (!visible) return res.status(403).json({ detail: "Outside your jurisdiction" });

    alert.status = "acknowledged";
    alert.acknowledgements = [
      ...(alert.acknowledgements || []),
      {
        official_id: official._id,
        official_name: official.full_name || official.employee_id,
        acknowledged_at: new Date(),
      },
    ];
    await alert.save();

    await audit({
      actorRole: "government",
      actorIdentifier: official.employee_id ?? req.userId,
      action: "sos.acknowledge",
      resourceType: "sos_alert",
      resourceId: String(alert._id),
      ip: req.ip,
      success: true,
    });

    res.json(alert.toJSON());
  } catch (err) {
    console.error("[sos/ack]", err);
    res.status(500).json({ detail: "Could not acknowledge the alert." });
  }
});

export default router;
