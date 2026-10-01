import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Users collection — both workers and government officials (role field).
 * Field names mirror the legacy SQLModel schema so the frontend types and
 * API payloads stay compatible.
 */
const UserSchema = new Schema(
  {
    worker_id: { type: String, index: true }, // SS-XXXXXX (workers only)
    employee_id: { type: String }, // officials only; unique sparse index below
    role: { type: String, enum: ["worker", "government"], required: true, index: true },

    full_name: { type: String, required: true, trim: true },
    mobile_number: { type: String, required: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    password_hash: { type: String, default: null },

    // worker profile
    gender: { type: String, enum: ["male", "female", "other", null], default: null },
    date_of_birth: { type: Date, default: null },
    aadhaar_last4: { type: String, default: null }, // never store the full number
    occupation: { type: String, default: null },
    years_of_experience: { type: Number, default: null },
    preferred_language: { type: String, default: "en" },

    current_address_line: { type: String, default: null },
    current_village_or_city: { type: String, default: null },
    current_district: { type: String, default: null },
    current_state: { type: String, default: null },
    current_pincode: { type: String, default: null },

    native_state: { type: String, default: null },
    native_district: { type: String, default: null },

    emergency_contact_name: { type: String, default: null },
    emergency_contact_relation: { type: String, default: null },
    emergency_contact_number: { type: String, default: null },

    profile_photo_path: { type: String, default: null },
    qr_code: { type: String, default: null }, // data URL (worker ID QR)

    // government fields
    department: { type: String, default: null },
    designation: { type: String, default: null },
    state: { type: String, default: null },
    district: { type: String, default: null },
    is_superadmin: { type: Boolean, default: false },

    is_phone_verified: { type: Boolean, default: false },
    // Privacy notice at registration: worker consented to chat text/voice
    // being processed by third-party AI providers (see the registration UI).
    consent_ai_processing: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "users" }
);

// Sparse unique indexes: null values don't collide.
UserSchema.index({ mobile_number: 1 }, { unique: true, sparse: false });
UserSchema.index({ employee_id: 1 }, { unique: true, sparse: true });

/** Public worker shape (what the frontend Worker type expects). */
UserSchema.methods.toWorkerJSON = function () {
  return {
    id: String(this._id),
    worker_id: this.worker_id,
    full_name: this.full_name,
    mobile_number: this.mobile_number,
    email: this.email,
    role: this.role,
    profile_photo_path: this.profile_photo_path,
    preferred_language: this.preferred_language,
    qr_code: this.qr_code,
  };
};

UserSchema.methods.toGovernmentJSON = function () {
  return {
    id: String(this._id),
    employee_id: this.employee_id,
    full_name: this.full_name,
    email: this.email,
    mobile_number: this.mobile_number,
    department: this.department,
    designation: this.designation,
    state: this.state,
    district: this.district,
    is_superadmin: this.is_superadmin,
    created_at: this.createdAt,
  };
};

export const User = mongoose.model("User", UserSchema);
