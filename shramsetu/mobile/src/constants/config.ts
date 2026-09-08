import Constants from "expo-constants";

/**
 * The backend must be reachable from the physical device/emulator, not just
 * "localhost" on your dev machine. When running with Expo Go on a real
 * phone, set this to your machine's LAN IP, e.g. http://192.168.1.5:8000/api/v1
 * (find it with `ipconfig`/`ifconfig`), or use `expo start --tunnel`.
 * Override by setting extra.apiBaseUrl in app.json, or EXPO_PUBLIC_API_URL.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string) ||
  "http://localhost:8000/api/v1";
