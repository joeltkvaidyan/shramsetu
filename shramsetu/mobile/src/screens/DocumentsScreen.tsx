/**
 * Documents Screen - Secure document wallet with PIN protection
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Document {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  uploadDate: string;
  size: number;
}

const CATEGORIES = [
  { id: "identity", label: "Identity", icon: "🪪", color: "#3b82f6" },
  { id: "income", label: "Income", icon: "💰", color: "#10b981" },
  { id: "health", label: "Health", icon: "🏥", color: "#ef4444" },
  { id: "employment", label: "Employment", icon: "💼", color: "#f59e0b" },
  { id: "other", label: "Other", icon: "📄", color: "#6366f1" },
];

export function DocumentsScreen() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    checkPinStatus();
  }, []);

  const checkPinStatus = async () => {
    const savedPin = await AsyncStorage.getItem("document_pin");
    if (savedPin) {
      setIsUnlocked(false);
    } else {
      // First time - prompt to set PIN
      Alert.alert("Set Document PIN", "Please set a PIN to protect your documents");
      setIsUnlocked(true);
    }
    setIsLoading(false);
  };

  const verifyPin = async (enteredPin: string) => {
    const savedPin = await AsyncStorage.getItem("document_pin");
    if (enteredPin === savedPin) {
      setIsUnlocked(true);
      loadDocuments();
    } else {
      Alert.alert("Wrong PIN", "Please try again");
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/v1/documents", {
        headers: {
          Authorization: `Bearer ${await AsyncStorage.getItem("token")}`,
        },
      });
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error("Failed to load documents:", error);
    }
  };

  const uploadDocument = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const formData = new FormData();
      formData.append("file", {
        uri: result.assets[0].uri,
        type: "application/octet-stream",
        name: "document.jpg",
      } as any);

      try {
        const response = await fetch("http://localhost:8000/api/v1/documents/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await AsyncStorage.getItem("token")}`,
          },
          body: formData,
        });

        if (response.ok) {
          Alert.alert("Success", "Document uploaded successfully");
          loadDocuments();
        }
      } catch (error) {
        Alert.alert("Error", "Failed to upload document");
      }
    }
  };

  const renderDocument = ({ item }: { item: Document }) => {
    const category = CATEGORIES.find((c) => c.id === item.category) || CATEGORIES[4];
    return (
      <TouchableOpacity style={styles.documentCard} activeOpacity={0.7}>
        <View style={[styles.documentIcon, { backgroundColor: category.color + "20" }]}>
          <Text style={styles.documentEmoji}>{category.icon}</Text>
        </View>
        <View style={styles.documentInfo}>
          <Text style={styles.documentName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.documentMeta}>
            {category.label} • {(item.size / 1024 / 1024).toFixed(2)} MB
          </Text>
          <Text style={styles.documentDate}>{item.uploadDate}</Text>
        </View>
        <TouchableOpacity style={styles.documentAction}>
          <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!isUnlocked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pinContainer}>
          <Text style={styles.pinIcon}>🔒</Text>
          <Text style={styles.pinTitle}>Document Wallet</Text>
          <Text style={styles.pinSubtitle}>Enter your PIN to access documents</Text>
          
          <View style={styles.pinInputContainer}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.pinDot, pin.length > i && styles.pinDotFilled]}
              />
            ))}
          </View>

          <View style={styles.pinPad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"].map((num, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.pinKey, num === null && styles.pinKeyEmpty]}
                onPress={() => {
                  if (num === "del") {
                    setPin(pin.slice(0, -1));
                  } else if (num !== null && pin.length < 4) {
                    const newPin = pin + num;
                    setPin(newPin);
                    if (newPin.length === 4) {
                      verifyPin(newPin);
                      setPin("");
                    }
                  }
                }}
              >
                {num !== null && (
                  <Text style={styles.pinKeyText}>{num}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.categoryText, !selectedCategory && styles.categoryTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryChip,
              selectedCategory === cat.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Text style={styles.categoryIcon}>{cat.icon}</Text>
            <Text
              style={[
                styles.categoryText,
                selectedCategory === cat.id && styles.categoryTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Documents List */}
      <FlatList
        data={documents.filter(
          (doc) => !selectedCategory || doc.category === selectedCategory
        )}
        renderItem={renderDocument}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyTitle}>No documents yet</Text>
            <Text style={styles.emptySubtitle}>Upload your first document to get started</Text>
          </View>
        }
      />

      {/* Upload Button */}
      <TouchableOpacity style={styles.uploadButton} onPress={uploadDocument}>
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.uploadButtonText}>Upload Document</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pinContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  pinIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  pinTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 8,
  },
  pinSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 32,
  },
  pinInputContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 32,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e2e8f0",
  },
  pinDotFilled: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  pinPad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 280,
    justifyContent: "center",
    gap: 16,
  },
  pinKey: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pinKeyEmpty: {
    backgroundColor: "transparent",
    elevation: 0,
  },
  pinKeyText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1e293b",
  },
  categoryContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 8,
    flexWrap: "wrap",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  categoryChipActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  categoryIcon: {
    marginRight: 4,
  },
  categoryText: {
    fontSize: 14,
    color: "#64748b",
  },
  categoryTextActive: {
    color: "white",
  },
  listContent: {
    padding: 16,
  },
  documentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  documentIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  documentEmoji: {
    fontSize: 24,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  documentMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  documentDate: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
  documentAction: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748b",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3b82f6",
    margin: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  uploadButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
