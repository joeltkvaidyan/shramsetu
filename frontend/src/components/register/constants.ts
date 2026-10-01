/**
 * Shared types, lists and helpers for the worker registration wizard.
 * Extracted verbatim from WorkerRegisterPage (behaviour unchanged).
 */

export interface RegistrationFormData {
  // Step 1: Basic Info
  fullName: string;
  mobileNumber: string;
  email: string;
  password: string;
  photo: File | null;
  photoPreview: string | null;

  // Step 2: Personal Details
  dateOfBirth: string;
  gender: string;
  aadhaarNumber: string;

  // Step 3: Current Address
  currentAddressLine: string;
  currentVillageOrCity: string;
  currentDistrict: string;
  currentState: string;
  currentPincode: string;

  // Step 4: Native Address
  nativeState: string;
  nativeDistrict: string;

  // Step 5: Occupation
  occupation: string;
  yearsOfExperience: string;

  // Step 6: Emergency Contact
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactNumber: string;

  // Privacy consent (required on the final step)
  consentAiProcessing: boolean;
}

export interface RegistrationResponse {
  worker_id: string;
  mobile_number: string;
}

export const STEPS = [
  "stepBasicInfo",
  "stepPersonalDetails",
  "stepAddress",
  "stepOccupation",
  "stepEmergency"
];

export const OCCUPATIONS = [
  "construction",
  "domestic_work",
  "agriculture",
  "textile_garment",
  "factory_worker",
  "driver_transport",
  "street_vendor",
  "security_guard",
  "hospitality",
  "other",
];

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

export const EMPTY_FORM: RegistrationFormData = {
  fullName: "",
  mobileNumber: "",
  email: "",
  password: "",
  photo: null,
  photoPreview: null,
  dateOfBirth: "",
  gender: "",
  aadhaarNumber: "",
  currentAddressLine: "",
  currentVillageOrCity: "",
  currentDistrict: "",
  currentState: "",
  currentPincode: "",
  nativeState: "",
  nativeDistrict: "",
  occupation: "",
  yearsOfExperience: "",
  emergencyContactName: "",
  emergencyContactRelation: "",
  emergencyContactNumber: "",
  consentAiProcessing: false,
};

/** Field class with error highlight, shared by all register steps. */
export const fieldClass = (fieldErrors: Record<string, string>, field: string) =>
  `input-field${fieldErrors[field] ? " input-error" : ""}`;

/** Props every register step receives from the wizard page. */
export interface RegisterStepProps {
  formData: RegistrationFormData;
  fieldErrors: Record<string, string>;
  onChange: (field: keyof RegistrationFormData, value: string | boolean) => void;
}
