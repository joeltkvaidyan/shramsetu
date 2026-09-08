import { FormEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useAuth } from "../store/AuthContext";

interface FormData {
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
}

interface RegistrationResponse {
  worker_id: string;
  mobile_number: string;
  dev_otp?: string;
}

const STEPS = [
  "stepBasicInfo",
  "stepPersonalDetails",
  "stepAddress",
  "stepOccupation",
  "stepEmergency"
];

const OCCUPATIONS = [
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

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

export default function WorkerRegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const [currentStep, setCurrentStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "otp">("form");
  const [formData, setFormData] = useState<FormData>({
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
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [registrationData, setRegistrationData] = useState<RegistrationResponse | null>(null);

  // Auto-verify OTP in developer mode
  useEffect(() => {
    if (phase === "otp" && devOtp && otp === "") {
      // Auto-fill the OTP in developer mode
      setOtp(devOtp);
    }
  }, [phase, devOtp, otp]);

  // Auto-submit OTP in developer mode after it's filled
  useEffect(() => {
    if (phase === "otp" && devOtp && otp === devOtp && !submitting) {
      handleOtpSubmit();
    }
  }, [otp, devOtp, phase, submitting]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({
        ...formData,
        photo: file,
        photoPreview: URL.createObjectURL(file),
      });
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData({
      ...formData,
      [field]: value,
    });
  };

  const validateStep = () => {
    switch (currentStep) {
      case 0: // Basic Info
        if (!formData.fullName.trim()) {
          setError(t("common.required"));
          return false;
        }
        if (!formData.mobileNumber.trim() || formData.mobileNumber.replace(/\D/g, "").length < 10) {
          setError("Mobile number must be at least 10 digits");
          return false;
        }
        if (!formData.password || formData.password.length < 6) {
          setError("Password must be at least 6 characters");
          return false;
        }
        return true;
      case 1: // Personal Details
        if (!formData.dateOfBirth) {
          setError("Date of birth is required");
          return false;
        }
        if (!formData.gender) {
          setError("Gender is required");
          return false;
        }
        if (formData.aadhaarNumber && formData.aadhaarNumber.replace(/\D/g, "").length !== 12) {
          setError("Aadhaar number must be 12 digits");
          return false;
        }
        return true;
      case 2: // Current Address
        if (!formData.currentVillageOrCity.trim()) {
          setError("City/Village is required");
          return false;
        }
        if (!formData.currentState) {
          setError("State is required");
          return false;
        }
        if (formData.currentPincode && formData.currentPincode.length !== 6) {
          setError("Pincode must be 6 digits");
          return false;
        }
        return true;
      case 3: // Occupation
        if (!formData.occupation) {
          setError("Occupation is required");
          return false;
        }
        if (!formData.yearsOfExperience) {
          setError("Years of experience is required");
          return false;
        }
        return true;
      case 4: // Emergency Contact
        if (!formData.emergencyContactName.trim()) {
          setError("Emergency contact name is required");
          return false;
        }
        if (!formData.emergencyContactNumber.trim() || formData.emergencyContactNumber.replace(/\D/g, "").length < 10) {
          setError("Valid emergency contact number is required");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    setError(null);
    if (validateStep()) {
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handlePrevious = () => {
    setError(null);
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateStep()) return;

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("full_name", formData.fullName);
      form.append("mobile_number", formData.mobileNumber);
      form.append("password", formData.password);
      if (formData.email) form.append("email", formData.email);
      form.append("preferred_language", i18n.language || "en");
      if (formData.photo) form.append("profile_photo", formData.photo);

      if (formData.dateOfBirth) form.append("date_of_birth", formData.dateOfBirth);
      if (formData.gender) form.append("gender", formData.gender);
      if (formData.aadhaarNumber) form.append("aadhaar_number", formData.aadhaarNumber);

      if (formData.currentAddressLine) form.append("current_address_line", formData.currentAddressLine);
      if (formData.currentVillageOrCity) form.append("current_village_or_city", formData.currentVillageOrCity);
      if (formData.currentDistrict) form.append("current_district", formData.currentDistrict);
      if (formData.currentState) form.append("current_state", formData.currentState);
      if (formData.currentPincode) form.append("current_pincode", formData.currentPincode);

      if (formData.nativeState) form.append("native_state", formData.nativeState);
      if (formData.nativeDistrict) form.append("native_district", formData.nativeDistrict);

      if (formData.occupation) form.append("occupation", formData.occupation);
      if (formData.yearsOfExperience) form.append("years_of_experience", formData.yearsOfExperience);

      if (formData.emergencyContactName) form.append("emergency_contact_name", formData.emergencyContactName);
      if (formData.emergencyContactRelation) form.append("emergency_contact_relation", formData.emergencyContactRelation);
      if (formData.emergencyContactNumber) form.append("emergency_contact_number", formData.emergencyContactNumber);

      const res = await api.post<RegistrationResponse>("/auth/worker/register", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      // Registration successful, now need OTP verification
      setRegistrationData(res.data);
      if (res.data.dev_otp) {
        setDevOtp(res.data.dev_otp);
      }
      setPhase("otp");
    } catch {
      setError(t("auth.registrationFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (!otp || !registrationData) {
      setError("Please enter the OTP");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/auth/worker/otp/verify", {
        mobile_number: registrationData.mobile_number,
        otp: otp,
      });
      
      loginWithToken(res.data.access_token, res.data.worker);
      navigate("/worker/dashboard");
    } catch {
      setError("Invalid OTP. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen 
      title={phase === "form" ? t("auth.register") : "Verify Phone"} 
      onBack={phase === "form" ? (currentStep === 0 ? true : () => handlePrevious()) : true}
    >
      <div className="mt-4">
        {phase === "form" ? (
          <>
            {/* FORM PHASE */}
            {/* Step indicator */}
            <div className="mb-6">
              <div className="flex justify-between items-center">
                {STEPS.map((_, idx) => (
                  <div key={idx} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                        idx === currentStep
                          ? "bg-brand-600 text-white"
                          : idx < currentStep
                          ? "bg-green-500 text-white"
                          : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {idx < currentStep ? "✓" : idx + 1}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div
                        className={`h-1 flex-1 ml-2 mr-2 ${
                          idx < currentStep ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-600 dark:text-gray-400 mt-2">
                {t("auth.stepOfTotal", {
                  current: currentStep + 1,
                  total: STEPS.length,
                })}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Step 1: Basic Info */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t("auth.stepBasicInfo")}</h3>

                  <div className="flex flex-col items-center mb-4">
                    <label
                      htmlFor="photo-upload"
                      className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-brand-500"
                    >
                      {formData.photoPreview ? (
                        <img src={formData.photoPreview} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl text-gray-400">📷</span>
                      )}
                    </label>
                    <input id="photo-upload" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("auth.uploadPhoto")}</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.fullName")} *
                    </label>
                    <input
                      className="input-field"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange("fullName", e.target.value)}
                      placeholder="e.g., Raj Kumar"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.mobileNumber")} *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      className="input-field"
                      value={formData.mobileNumber}
                      onChange={(e) => handleInputChange("mobileNumber", e.target.value)}
                      placeholder="9876543210"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.email")} <span className="text-gray-400">({t("auth.optional")})</span>
                    </label>
                    <input
                      type="email"
                      className="input-field"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="your@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.password")} *
                    </label>
                    <input
                      type="password"
                      minLength={6}
                      className="input-field"
                      value={formData.password}
                      onChange={(e) => handleInputChange("password", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Personal Details */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t("auth.stepPersonalDetails")}</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.dateOfBirth")} *
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={formData.dateOfBirth}
                      onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.gender")} *
                    </label>
                    <select
                      className="input-field"
                      value={formData.gender}
                      onChange={(e) => handleInputChange("gender", e.target.value)}
                    >
                      <option value="">Select gender</option>
                      <option value="male">{t("auth.genderMale")}</option>
                      <option value="female">{t("auth.genderFemale")}</option>
                      <option value="other">{t("auth.genderOther")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.aadhaarNumber")}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input-field"
                      value={formData.aadhaarNumber}
                      onChange={(e) => handleInputChange("aadhaarNumber", e.target.value)}
                      placeholder="12-digit Aadhaar number"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Stored securely and used only for welfare scheme eligibility
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: Current Address */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t("auth.currentAddress")}</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.addressLine")}
                    </label>
                    <input
                      className="input-field"
                      value={formData.currentAddressLine}
                      onChange={(e) => handleInputChange("currentAddressLine", e.target.value)}
                      placeholder="House no., street name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.villageOrCity")} *
                    </label>
                    <input
                      className="input-field"
                      value={formData.currentVillageOrCity}
                      onChange={(e) => handleInputChange("currentVillageOrCity", e.target.value)}
                      placeholder="Village or city name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.district")}
                    </label>
                    <input
                      className="input-field"
                      value={formData.currentDistrict}
                      onChange={(e) => handleInputChange("currentDistrict", e.target.value)}
                      placeholder="District"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.state")} *
                    </label>
                    <select
                      className="input-field"
                      value={formData.currentState}
                      onChange={(e) => handleInputChange("currentState", e.target.value)}
                    >
                      <option value="">Select state</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.pincode")}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="input-field"
                      value={formData.currentPincode}
                      onChange={(e) => handleInputChange("currentPincode", e.target.value)}
                      placeholder="6-digit pincode"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Occupation */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t("auth.stepOccupation")}</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.nativeState")}
                    </label>
                    <select
                      className="input-field"
                      value={formData.nativeState}
                      onChange={(e) => handleInputChange("nativeState", e.target.value)}
                    >
                      <option value="">Select home state</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Your home/native state for welfare scheme eligibility
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.nativeDistrict")}
                    </label>
                    <input
                      className="input-field"
                      value={formData.nativeDistrict}
                      onChange={(e) => handleInputChange("nativeDistrict", e.target.value)}
                      placeholder="Home district"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.occupation")} *
                    </label>
                    <select
                      className="input-field"
                      value={formData.occupation}
                      onChange={(e) => handleInputChange("occupation", e.target.value)}
                    >
                      <option value="">Select your occupation</option>
                      <option value="construction">{t("auth.occupationConstruction")}</option>
                      <option value="domestic_work">{t("auth.occupationDomestic")}</option>
                      <option value="agriculture">{t("auth.occupationAgriculture")}</option>
                      <option value="textile_garment">{t("auth.occupationTextile")}</option>
                      <option value="factory_worker">{t("auth.occupationFactory")}</option>
                      <option value="driver_transport">{t("auth.occupationDriver")}</option>
                      <option value="street_vendor">{t("auth.occupationVendor")}</option>
                      <option value="security_guard">{t("auth.occupationSecurity")}</option>
                      <option value="hospitality">{t("auth.occupationHospitality")}</option>
                      <option value="other">{t("auth.occupationOther")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.yearsOfExperience")} *
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="80"
                      className="input-field"
                      value={formData.yearsOfExperience}
                      onChange={(e) => handleInputChange("yearsOfExperience", e.target.value)}
                      placeholder="Years"
                    />
                  </div>
                </div>
              )}

              {/* Step 5: Emergency Contact */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t("auth.stepEmergency")}</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.emergencyContactName")} *
                    </label>
                    <input
                      className="input-field"
                      value={formData.emergencyContactName}
                      onChange={(e) => handleInputChange("emergencyContactName", e.target.value)}
                      placeholder="Full name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.emergencyContactRelation")}
                    </label>
                    <input
                      className="input-field"
                      value={formData.emergencyContactRelation}
                      onChange={(e) => handleInputChange("emergencyContactRelation", e.target.value)}
                      placeholder="e.g., Mother, Brother, Spouse"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t("auth.emergencyContactNumber")} *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      className="input-field"
                      value={formData.emergencyContactNumber}
                      onChange={(e) => handleInputChange("emergencyContactNumber", e.target.value)}
                      placeholder="10-digit mobile number"
                    />
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900 p-3 rounded">
                    📋 By completing this registration, you agree to have your profile used for welfare scheme
                    eligibility matching and emergency communication purposes only.
                  </p>
                </div>
              )}

              {error && <p className="text-red-600 text-sm p-2 bg-red-50 dark:bg-red-900 rounded">{error}</p>}

              {/* Navigation Buttons */}
              <div className="flex gap-3 mt-6">
                {currentStep > 0 && (
                  <button
                    type="button"
                    onClick={handlePrevious}
                    className="flex-1 btn-secondary"
                  >
                    {t("auth.previous")}
                  </button>
                )}

                {currentStep < STEPS.length - 1 ? (
                  <button type="button" onClick={handleNext} className="flex-1 btn-primary">
                    {t("auth.next")}
                  </button>
                ) : (
                  <button type="submit" disabled={submitting} className="flex-1 btn-primary">
                    {submitting ? t("auth.registering") : t("auth.createAccount")}
                  </button>
                )}
              </div>
            </form>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
              {t("auth.haveAccount")}{" "}
              <button onClick={() => navigate("/worker/login")} className="text-brand-600 dark:text-brand-400 font-semibold">
                {t("auth.login")}
              </button>
            </p>
          </>
        ) : (
          <>
            {/* OTP PHASE */}
            <div className="space-y-6 mt-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Verify Your Phone</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Enter the 6-digit code sent to {registrationData?.mobile_number}
                </p>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleOtpSubmit(); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    OTP Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="input-field text-center text-2xl tracking-widest"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    disabled={submitting}
                  />
                </div>

                {devOtp && (
                  <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-sm text-blue-900 dark:text-blue-100">
                    <strong>Developer Mode:</strong> OTP {devOtp} (auto-verifying...)
                  </div>
                )}

                {error && <p className="text-red-600 text-sm p-2 bg-red-50 dark:bg-red-900 rounded">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting || otp.length !== 6}
                  className="btn-primary mt-6"
                >
                  {submitting ? "Verifying..." : "Verify & Continue"}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}

