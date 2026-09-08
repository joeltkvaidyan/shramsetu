export type Gender = "male" | "female" | "other";

export type Occupation =
  | "construction"
  | "domestic_work"
  | "agriculture"
  | "textile_garment"
  | "factory_worker"
  | "driver_transport"
  | "street_vendor"
  | "security_guard"
  | "hospitality"
  | "other";

export interface Worker {
  id: number;
  worker_id: string;
  full_name: string;
  mobile_number: string;
  email?: string | null;
  role: string;
  date_of_birth?: string | null;
  gender?: Gender | null;
  aadhaar_number?: string | null;
  current_address_line?: string | null;
  current_village_or_city?: string | null;
  current_district?: string | null;
  current_state?: string | null;
  current_pincode?: string | null;
  native_state?: string | null;
  native_district?: string | null;
  occupation?: Occupation | null;
  years_of_experience?: number | null;
  emergency_contact_name?: string | null;
  emergency_contact_relation?: string | null;
  emergency_contact_number?: string | null;
  profile_photo_path?: string | null;
  preferred_language: string;
  is_phone_verified: boolean;
  qr_code?: string | null;
}

export interface RegisterResponse {
  worker_id: string;
  mobile_number: string;
  message: string;
  dev_otp?: string | null;
}

export interface DocumentItem {
  id: number;
  display_name: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface ChatAnswer {
  answer: string;
  simple_explanation: string;
  source_document: string | null;
  government_department: string | null;
  confidence_score: number;
  last_updated_date: string | null;
  grounded: boolean;
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
  language: string;
  created_at: string;
  meta: ChatAnswer | null;
}

export type GrievanceCategory =
  | "unpaid_wages"
  | "workplace_safety"
  | "harassment_abuse"
  | "illegal_termination"
  | "document_issue"
  | "employer_dispute"
  | "insurance_claim"
  | "accommodation"
  | "other";

export type GrievanceStatus = "submitted" | "under_review" | "resolved" | "rejected" | "withdrawn";

export interface Grievance {
  id: number;
  complaint_number: string;
  category: GrievanceCategory;
  subject: string;
  description: string;
  status: GrievanceStatus;
  employer_name?: string | null;
  incident_location?: string | null;
  incident_date?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
}

export interface GrievanceAttachment {
  id: number;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface GrievanceStatusLogItem {
  status: string;
  note?: string | null;
  changed_by: string;
  created_at: string;
}

export interface GrievanceDetail extends Grievance {
  attachments: GrievanceAttachment[];
  timeline: GrievanceStatusLogItem[];
}
