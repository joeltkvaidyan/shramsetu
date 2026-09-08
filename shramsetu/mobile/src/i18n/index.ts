import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import bn from "./locales/bn.json";
import te from "./locales/te.json";
import ta from "./locales/ta.json";
import ml from "./locales/ml.json";

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  bn: { translation: bn },
  te: { translation: te },
  ta: { translation: ta },
  ml: { translation: ml },
};

const STORAGE_KEY = "shramsetu_language";

export async function getStoredLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function setStoredLanguage(code: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, code);
}

export async function initI18n(): Promise<void> {
  const stored = await getStoredLanguage();
  await i18n.use(initReactI18next).init({
    resources,
    lng: stored ?? "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
  });
}

export default i18n;
