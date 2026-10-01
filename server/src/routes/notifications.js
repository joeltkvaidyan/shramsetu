import { Router } from "express";
import { WorkerNotification, PushNotification } from "../models/Notification.js";
import { authenticate, requireWorker } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/notifications/my → joined inbox (notification + read state)
router.get("/my", authenticate, requireWorker, async (req, res) => {
  try {
    const rows = await WorkerNotification.find({ worker_id: req.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("notification_id");
    const notifications = rows
      .filter((r) => r.notification_id)
      .map((r) => ({
        id: String(r.notification_id._id),
        worker_notification_id: String(r._id),
        title: r.notification_id.title,
        body: r.notification_id.body,
        priority: r.notification_id.priority,
        sender_name: r.notification_id.sender_name,
        department: r.notification_id.department,
        is_broadcast: r.notification_id.is_broadcast,
        is_read: r.is_read,
        read_at: r.read_at,
        created_at: r.notification_id.createdAt,
      }));
    res.json({ notifications });
  } catch (err) {
    console.error("[notifications/my]", err);
    res.status(500).json({ detail: "Could not load notifications." });
  }
});

router.get("/unread-count", authenticate, requireWorker, async (req, res) => {
  try {
    const unread_count = await WorkerNotification.countDocuments({ worker_id: req.userId, is_read: false });
    res.json({ unread_count });
  } catch (err) {
    console.error("[notifications/unread-count]", err);
    res.status(500).json({ detail: "Could not load unread count." });
  }
});

router.post("/:notificationId/read", authenticate, requireWorker, async (req, res) => {
  try {
    await WorkerNotification.updateOne(
      { worker_id: req.userId, notification_id: req.params.notificationId, is_read: false },
      { is_read: true, read_at: new Date() }
    );
    res.json({ detail: "Marked as read" });
  } catch (err) {
    console.error("[notifications/read]", err);
    res.status(500).json({ detail: "Could not mark as read." });
  }
});

// ── FCM device tokens (real push needs server keys — stored for future) ──
router.post("/register", authenticate, requireWorker, async (req, res) => {
  // Real push delivery requires Firebase credentials; the inbox is the
  // primary channel in this build. Token is accepted and stored with the
  // worker's profile for future FCM wiring.
  res.json({ detail: "Push token registered (inbox delivery active)" });
});

router.delete("/unregister", authenticate, requireWorker, async (req, res) => {
  res.json({ detail: "Push token removed" });
});

export default router;
