import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * PushNotification — the government's sent message (one row per send).
 * Scoped targeting metadata is kept on the document for the Sent list.
 */
const PushNotificationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    target: { type: String, default: "all" }, // all | occupation | state | district
    target_value: { type: String, default: null },
    sender_id: { type: Schema.Types.ObjectId, ref: "User", index: true },
    sender_name: String,
    department: { type: String, default: "general" },
    is_broadcast: { type: Boolean, default: true },
    sent_count: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "push_notifications" }
);

/**
 * WorkerNotification — per-recipient delivery + read state.
 * Inbox badge counts read from here; broadcasts don't duplicate rows at
 * send time because each recipient still needs independent read state.
 */
const WorkerNotificationSchema = new Schema(
  {
    notification_id: { type: Schema.Types.ObjectId, ref: "PushNotification", required: true, index: true },
    worker_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
  },
  { timestamps: true, collection: "worker_notifications" }
);

WorkerNotificationSchema.index({ worker_id: 1, notification_id: 1 }, { unique: true });

PushNotificationSchema.methods.toJSON = function () {
  return {
    id: String(this._id),
    title: this.title,
    body: this.body,
    priority: this.priority,
    target: this.target,
    target_value: this.target_value,
    sender_name: this.sender_name,
    department: this.department,
    is_broadcast: this.is_broadcast,
    sent_count: this.sent_count,
    created_at: this.createdAt,
  };
};

export const PushNotification = mongoose.model("PushNotification", PushNotificationSchema);
export const WorkerNotification = mongoose.model("WorkerNotification", WorkerNotificationSchema);
