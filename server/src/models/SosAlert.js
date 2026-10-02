import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * SosAlert — an emergency alert raised by a worker from their dashboard.
 *
 * Smallest honest version (docs/FEATURE_PARITY.md, proposal 1): the alert is
 * a RECORD + DASHBOARD DELIVERY ONLY. Nothing is sent to any phone — no SMS
 * gateway, no automated call, no push. The worker's emergency contact is
 * snapshotted for the officer to dial manually, and the UI says exactly
 * that. owner_state/owner_district follow the Grievance convention so the
 * officials' jurisdiction scoping (utils/scope.js) applies verbatim.
 */
const SosAlertSchema = new Schema(
  {
    worker_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Worker snapshot at raise time (immutable record of who/where they were)
    worker_name: { type: String, default: null },
    worker_mobile: { type: String, default: null },

    // Jurisdiction snapshot — same field names as Grievance so scope filters
    // are shared without modification.
    owner_state: { type: String, default: null, index: true },
    owner_district: { type: String, default: null, index: true },

    location_text: { type: String, default: null }, // optional free-text "where I am"
    note: { type: String, default: null }, // optional short note

    status: { type: String, enum: ["open", "acknowledged"], default: "open", index: true },

    // Emergency contact snapshotted at raise time (officer dials manually —
    // the system never calls or texts anyone).
    emergency_contact_name: { type: String, default: null },
    emergency_contact_relation: { type: String, default: null },
    emergency_contact_number: { type: String, default: null },

    acknowledgements: [
      {
        _id: false,
        official_id: { type: Schema.Types.ObjectId, ref: "User" },
        official_name: String,
        acknowledged_at: Date,
      },
    ],
  },
  { timestamps: true, collection: "sos_alerts" }
);

SosAlertSchema.methods.toJSON = function () {
  return {
    id: String(this._id),
    worker_id: String(this.worker_id),
    worker_name: this.worker_name,
    worker_mobile: this.worker_mobile,
    status: this.status,
    location_text: this.location_text,
    note: this.note,
    owner_state: this.owner_state,
    owner_district: this.owner_district,
    emergency_contact_name: this.emergency_contact_name,
    emergency_contact_relation: this.emergency_contact_relation,
    emergency_contact_number: this.emergency_contact_number,
    acknowledgements: this.acknowledgements || [],
    created_at: this.createdAt,
  };
};

export const SosAlert = mongoose.model("SosAlert", SosAlertSchema);
