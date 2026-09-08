/**
 * Grievance Screen - File and track complaints
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const CATEGORIES = [
  { id: "unpaid_wages", label: "Unpaid Wages", icon: "💰", priority: "high" },
  { id: "workplace_safety", label: "Workplace Safety", icon: "⚠️", priority: "urgent" },
  { id: "harassment_abuse", label: "Harassment", icon: "🛡️", priority: "urgent" },
  { id: "illegal_termination", label: "Illegal Termination", icon: "🚫", priority: "high" },
  { id: "document_issue", label: "Document Issues", icon: "📄", priority: "medium" },
  { id: "employer_dispute", label: "Employer Dispute", icon: "💼", priority: "medium" },
  { id: "insurance_claim", label: "Insurance Claim", icon: "🏥", priority: "medium" },
  { id: "other", label: "Other", icon: "📋", priority: "low" },
];

export function GrievanceScreen() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [employerAddress, setEmployerAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategory = CATEGORIES.find((c) => c.id === category);

  const handleSubmit = async () => {
    if (!subject || !description || !category) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("http://localhost:8000/api/v1/grievances", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await AsyncStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          subject,
          description,
          category,
          employer_name: employerName,
          employer_address: employerAddress,
          priority: selectedCategory?.priority || "medium",
        }),
      });

      if (response.ok) {
        Alert.alert("Success", "Grievance submitted successfully", [
          { text: "OK", onPress: () => resetForm() },
        ]);
      } else {
        throw new Error("Failed to submit grievance");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to submit grievance. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubject("");
    setDescription("");
    setCategory("");
    setEmployerName("");
    setEmployerAddress("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>File a Grievance</Text>
          <Text style={styles.subtitle}>
            Report issues related to wages, safety, or worker rights
          </Text>
        </View>

        {/* Category Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category *</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryCard,
                  category === cat.id && styles.categoryCardActive,
                ]}
                onPress={() => setCategory(cat.id)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    category === cat.id && styles.categoryLabelActive,
                  ]}
                >
                  {cat.label}
                </Text>
                {cat.priority === "urgent" && (
                  <View style={styles.urgentBadge}>
                    <Text style={styles.urgentText}>URGENT</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Subject */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subject *</Text>
          <TextInput
            style={styles.input}
            placeholder="Brief description of the issue"
            placeholderTextColor="#9ca3af"
            value={subject}
            onChangeText={setSubject}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detailed Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Provide details about the issue, including dates, amounts, and any evidence..."
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Employer Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Employer Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Employer name"
            placeholderTextColor="#9ca3af"
            value={employerName}
            onChangeText={setEmployerName}
          />
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            placeholder="Work site address"
            placeholderTextColor="#9ca3af"
            value={employerAddress}
            onChangeText={setEmployerAddress}
          />
        </View>

        {/* Voice Recording */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Voice Description (Optional)</Text>
          <TouchableOpacity style={styles.voiceRecordButton}>
            <Ionicons name="mic" size={24} color="#3b82f6" />
            <Text style={styles.voiceRecordText}>Tap to record voice description</Text>
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="send" size={20} color="white" />
              <Text style={styles.submitButtonText}>Submit Grievance</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Help Text */}
        <Text style={styles.helpText}>
          Your grievance will be forwarded to the relevant government department. 
          You will receive updates on the status of your complaint.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e293b",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  categoryCard: {
    width: "47%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  categoryCardActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  categoryIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1e293b",
    textAlign: "center",
  },
  categoryLabelActive: {
    color: "#3b82f6",
  },
  urgentBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#ef4444",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  urgentText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "white",
  },
  input: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#1e293b",
  },
  textArea: {
    minHeight: 120,
  },
  voiceRecordButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  voiceRecordText: {
    marginLeft: 12,
    fontSize: 16,
    color: "#3b82f6",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 12,
  },
  helpText: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },
});
