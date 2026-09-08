import { useState } from "react";
import { View, Text, TouchableOpacity, Image, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { FormField } from "../components/FormField";
import { ChipSelect } from "../components/ChipSelect";
import { PrimaryButton } from "../components/Buttons";
import { api } from "../api/client";
import type { Gender, Occupation } from "../types";

const GENDER_OPTIONS: Gender[] = ["male", "female", "other"];
const OCCUPATION_OPTIONS: Occupation[] = [
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

export default function WorkerRegisterScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();

  // Identity
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(""); // YYYY-MM-DD
  const [gender, setGender] = useState<Gender | null>(null);
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);

  // Current address
  const [currentAddressLine, setCurrentAddressLine] = useState("");
  const [currentVillageOrCity, setCurrentVillageOrCity] = useState("");
  const [currentDistrict, setCurrentDistrict] = useState("");
  const [currentState, setCurrentState] = useState("");
  const [currentPincode, setCurrentPincode] = useState("");

  // Native address
  const [nativeState, setNativeState] = useState("");
  const [nativeDistrict, setNativeDistrict] = useState("");

  // Occupation
  const [occupation, setOccupation] = useState<Occupation | null>(null);
  const [yearsOfExperience, setYearsOfExperience] = useState("");

  // Emergency contact
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactRelation, setEmergencyContactRelation] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0]);
    }
  };

  const genderChipOptions = GENDER_OPTIONS.map((g) => ({ value: g, label: t(`auth.gender${g[0].toUpperCase()}${g.slice(1)}`) }));
  const occupationChipOptions = OCCUPATION_OPTIONS.map((o) => ({ value: o, label: t(`auth.occupations.${o}`) }));

  const handleSubmit = async () => {
    setError(null);

    if (!fullName || !mobileNumber || !password) {
      setError("Full name, mobile number, and password are required.");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("full_name", fullName);
      form.append("mobile_number", mobileNumber);
      form.append("password", password);
      if (email) form.append("email", email);
      form.append("preferred_language", i18n.language || "en");
      if (dateOfBirth) form.append("date_of_birth", dateOfBirth);
      if (gender) form.append("gender", gender);
      if (aadhaarNumber) form.append("aadhaar_number", aadhaarNumber);
      if (currentAddressLine) form.append("current_address_line", currentAddressLine);
      if (currentVillageOrCity) form.append("current_village_or_city", currentVillageOrCity);
      if (currentDistrict) form.append("current_district", currentDistrict);
      if (currentState) form.append("current_state", currentState);
      if (currentPincode) form.append("current_pincode", currentPincode);
      if (nativeState) form.append("native_state", nativeState);
      if (nativeDistrict) form.append("native_district", nativeDistrict);
      if (occupation) form.append("occupation", occupation);
      if (yearsOfExperience) form.append("years_of_experience", yearsOfExperience);
      if (emergencyContactName) form.append("emergency_contact_name", emergencyContactName);
      if (emergencyContactRelation) form.append("emergency_contact_relation", emergencyContactRelation);
      if (emergencyContactNumber) form.append("emergency_contact_number", emergencyContactNumber);

      if (photo) {
        const filename = photo.uri.split("/").pop() || "photo.jpg";
        const ext = filename.split(".").pop();
        form.append("profile_photo", {
          uri: photo.uri,
          name: filename,
          type: `image/${ext === "jpg" ? "jpeg" : ext}`,
        } as any);
      }

      const res = await api.post("/auth/worker/register", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      navigation.navigate("OTPVerify", {
        mobileNumber: res.data.mobile_number,
        devOtp: res.data.dev_otp ?? null,
      });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : t("auth.registrationFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title={t("auth.register")} showBack>
      <View className="items-center mb-5">
        <TouchableOpacity
          onPress={pickPhoto}
          className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-700 items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600"
        >
          {photo ? (
            <Image source={{ uri: photo.uri }} className="w-full h-full" />
          ) : (
            <Text className="text-3xl text-gray-400">📷</Text>
          )}
        </TouchableOpacity>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("auth.uploadPhoto")}</Text>
      </View>

      <SectionHeading label={t("auth.sectionIdentity")} />
      <FormField label={t("auth.fullName")} value={fullName} onChangeText={setFullName} />
      <FormField
        label={t("auth.mobileNumber")}
        keyboardType="phone-pad"
        value={mobileNumber}
        onChangeText={setMobileNumber}
        placeholder="9876543210"
      />
      <FormField label={t("auth.email")} optional keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <FormField label={t("auth.dateOfBirth")} optional placeholder="YYYY-MM-DD" value={dateOfBirth} onChangeText={setDateOfBirth} />
      <ChipSelect label={t("auth.gender")} optional options={genderChipOptions} value={gender} onChange={(v) => setGender(v as Gender)} />
      <FormField
        label={t("auth.aadhaarOptional")}
        optional
        keyboardType="number-pad"
        maxLength={12}
        hint={t("auth.aadhaarHint")}
        value={aadhaarNumber}
        onChangeText={setAadhaarNumber}
      />

      <SectionHeading label={t("auth.sectionCurrentAddress")} />
      <FormField label={t("auth.addressLine")} optional value={currentAddressLine} onChangeText={setCurrentAddressLine} />
      <FormField label={t("auth.villageOrCity")} optional value={currentVillageOrCity} onChangeText={setCurrentVillageOrCity} />
      <FormField label={t("auth.district")} optional value={currentDistrict} onChangeText={setCurrentDistrict} />
      <FormField label={t("auth.state")} optional value={currentState} onChangeText={setCurrentState} />
      <FormField label={t("auth.pincode")} optional keyboardType="number-pad" maxLength={6} value={currentPincode} onChangeText={setCurrentPincode} />

      <SectionHeading label={t("auth.sectionNativeAddress")} />
      <FormField label={t("auth.state")} optional hint={t("auth.nativeStateHint")} value={nativeState} onChangeText={setNativeState} />
      <FormField label={t("auth.nativeDistrict")} optional value={nativeDistrict} onChangeText={setNativeDistrict} />

      <SectionHeading label={t("auth.sectionOccupation")} />
      <ChipSelect options={occupationChipOptions} value={occupation} onChange={(v) => setOccupation(v as Occupation)} />
      <FormField
        label={t("auth.yearsOfExperience")}
        optional
        keyboardType="number-pad"
        value={yearsOfExperience}
        onChangeText={setYearsOfExperience}
      />

      <SectionHeading label={t("auth.sectionEmergencyContact")} />
      <FormField label={t("auth.emergencyContactName")} optional value={emergencyContactName} onChangeText={setEmergencyContactName} />
      <FormField label={t("auth.emergencyContactRelation")} optional value={emergencyContactRelation} onChangeText={setEmergencyContactRelation} />
      <FormField
        label={t("auth.emergencyContactNumber")}
        optional
        keyboardType="phone-pad"
        value={emergencyContactNumber}
        onChangeText={setEmergencyContactNumber}
      />

      <SectionHeading label={t("auth.sectionAccount")} />
      <FormField label={t("auth.password")} secureTextEntry value={password} onChangeText={setPassword} />

      {error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}

      <PrimaryButton onPress={handleSubmit} loading={submitting} className="mt-2">
        {submitting ? t("auth.registering") : t("auth.continueToOtp")}
      </PrimaryButton>
    </Screen>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <Text className="text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-400 mt-2 mb-3">
      {label}
    </Text>
  );
}
