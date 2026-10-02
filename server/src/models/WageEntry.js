import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * WageEntry — one worker-reported "day sheet" row (unique per worker +
 * work_date; re-submitting the same date updates instead of duplicating).
 *
 * Entries are SELF-REPORTED by the worker and are never verified against an
 * employer — the UI states this. The unpaid total feeds the pre-filled
 * unpaid_wages grievance (docs/FEATURE_PARITY.md, proposal 3).
 */
const WageEntrySchema = new Schema(
  {
    worker_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    work_date: { type: Date, required: true },
    employer_name: { type: String, default: null },
    agreed_amount: { type: Number, required: true, min: 0 },
    paid_amount: { type: Number, default: 0, min: 0 },
    payment_status: { type: String, enum: ["paid", "unpaid", "partial"], default: "unpaid" },
  },
  { timestamps: true, collection: "wage_entries" }
);

WageEntrySchema.index({ worker_id: 1, work_date: 1 }, { unique: true });

WageEntrySchema.methods.toJSON = function () {
  return {
    id: String(this._id),
    work_date: this.work_date,
    employer_name: this.employer_name,
    agreed_amount: this.agreed_amount,
    paid_amount: this.paid_amount,
    payment_status: this.payment_status,
    created_at: this.createdAt,
    updated_at: this.updatedAt,
  };
};

export const WageEntry = mongoose.model("WageEntry", WageEntrySchema);
