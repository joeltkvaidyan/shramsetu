/**
 * Push Notification Service for React Native/Expo
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3b82f6",
    });

    await Notifications.setNotificationChannelAsync("grievance", {
      name: "Grievance Updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#f59e0b",
    });

    await Notifications.setNotificationChannelAsync("scheme", {
      name: "Scheme Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#10b981",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PROJECT_ID,
      });
      token = tokenData.data;
      console.log("Push token:", token);

      // Save token locally
      await AsyncStorage.setItem("push_token", token);
    } catch (error) {
      console.error("Failed to get push token:", error);
    }
  } else {
    console.log("Push notifications require a physical device");
  }

  return token;
}

export async function sendTokenToServer(token: string): Promise<boolean> {
  try {
    const authToken = await AsyncStorage.getItem("token");
    if (!authToken) return false;

    const response = await fetch("http://localhost:8000/api/v1/notifications/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to send token to server:", error);
    return false;
  }
}

export async function unregisterFromNotifications(): Promise<boolean> {
  try {
    const token = await AsyncStorage.getItem("push_token");
    if (!token) return true;

    const authToken = await AsyncStorage.getItem("token");
    if (!authToken) return false;

    const response = await fetch(
      `http://localhost:8000/api/v1/notifications/unregister?token=${encodeURIComponent(token)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    if (response.ok) {
      await AsyncStorage.removeItem("push_token");
    }

    return response.ok;
  } catch (error) {
    console.error("Failed to unregister from notifications:", error);
    return false;
  }
}

export function addNotificationListener(
  handler: (notification: Notifications.Notification) => void
): () => void {
  const subscription = Notifications.addNotificationReceivedListener(handler);
  return () => subscription.remove();
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(handler);
  return () => subscription.remove();
}
