/**
 * Push Notifications Hook
 * Handles Firebase Cloud Messaging (FCM) registration and permissions
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";

type PushEvent = Event & { data: { json: () => any } | null };

interface PushNotificationState {
  isSupported: boolean;
  isPermissionGranted: boolean;
  fcmToken: string | null;
  error: string | null;
}

// Firebase configuration (replace with your Firebase config)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isPermissionGranted: false,
    fcmToken: null,
    error: null,
  });

  // Check if push notifications are supported
  useEffect(() => {
    const isSupported = "serviceWorker" in navigator && "PushManager" in window;
    setState((prev) => ({ ...prev, isSupported }));
  }, []);

  // Request permission and get FCM token
  const requestPermission = useCallback(async () => {
    if (!state.isSupported) {
      setState((prev) => ({ ...prev, error: "Push notifications not supported" }));
      return false;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission !== "granted") {
        setState((prev) => ({
          ...prev,
          isPermissionGranted: false,
          error: "Notification permission denied",
        }));
        return false;
      }

      setState((prev) => ({ ...prev, isPermissionGranted: true }));

      // For production, initialize Firebase and get FCM token
      // For now, we'll use a placeholder
      const fcmToken = `placeholder-token-${Date.now()}`;
      
      // Register token with backend
      await api.post("/notifications/register", {
        token: fcmToken,
        platform: "web",
      });

      setState((prev) => ({
        ...prev,
        fcmToken,
        error: null,
      }));

      return true;
    } catch (error: any) {
      console.error("Push notification setup error:", error);
      setState((prev) => ({
        ...prev,
        error: error.message || "Failed to setup push notifications",
      }));
      return false;
    }
  }, [state.isSupported]);

  // Unregister from push notifications
  const unregister = useCallback(async () => {
    if (state.fcmToken) {
      try {
        await api.delete(`/notifications/unregister?token=${state.fcmToken}`);
        setState((prev) => ({
          ...prev,
          fcmToken: null,
          isPermissionGranted: false,
        }));
      } catch (error) {
        console.error("Unregister error:", error);
      }
    }
  }, [state.fcmToken]);

  // Listen for incoming push notifications
  useEffect(() => {
    if (!state.isSupported || !state.isPermissionGranted) return;

    const handleNotification = (event: Event) => {
      const pushEvent = event as PushEvent;
      const data = pushEvent.data?.json();
      if (data) {
        // Show local notification
        new Notification(data.notification.title, {
          body: data.notification.body,
          icon: "/logo192.png",
          badge: "/badge-72x72.png",
          data: data.data,
        });
      }
    };

    // Register service worker for push notifications
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener("push", handleNotification);
      });
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.removeEventListener("push", handleNotification);
        });
      }
    };
  }, [state.isSupported, state.isPermissionGranted]);

  return {
    ...state,
    requestPermission,
    unregister,
  };
}
