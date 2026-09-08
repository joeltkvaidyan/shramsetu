/**
 * Local Storage Service using AsyncStorage
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  TOKEN: "token",
  USER: "user",
  LANGUAGE: "language",
  PIN: "document_pin",
  PUSH_TOKEN: "push_token",
  NOTIFICATIONS_ENABLED: "notifications_enabled",
  DARK_MODE: "dark_mode",
  SOUND_ENABLED: "sound_enabled",
  ONBOARDED: "onboarded",
};

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.TOKEN);
}

export async function removeToken(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.TOKEN);
}

export async function saveUser(user: any): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
}

export async function getUser(): Promise<any | null> {
  const user = await AsyncStorage.getItem(KEYS.USER);
  return user ? JSON.parse(user) : null;
}

export async function removeUser(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.USER);
}

export async function saveLanguage(code: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LANGUAGE, code);
}

export async function loadLanguage(): Promise<string> {
  const lang = await AsyncStorage.getItem(KEYS.LANGUAGE);
  return lang || "en";
}

export async function savePin(pin: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.PIN, pin);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const savedPin = await AsyncStorage.getItem(KEYS.PIN);
  return pin === savedPin;
}

export async function hasPin(): Promise<boolean> {
  const pin = await AsyncStorage.getItem(KEYS.PIN);
  return !!pin;
}

export async function savePushToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.PUSH_TOKEN, token);
}

export async function getPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.PUSH_TOKEN);
}

export async function saveSetting(key: string, value: any): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getSetting(key: string): Promise<any | null> {
  const value = await AsyncStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
