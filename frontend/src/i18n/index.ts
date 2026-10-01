import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import bn from "./locales/bn.json";
import te from "./locales/te.json";
import ta from "./locales/ta.json";
import ml from "./locales/ml.json";

// Adding a new language: import its JSON here, add an entry to `resources`,
// and register it in `src/i18n/languages.ts`. No other code changes needed.
export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  bn: { translation: bn },
  te: { translation: te },
  ta: { translation: ta },
  ml: { translation: ml },
};

const STORAGE_KEY = "shramsetu.language";

export function getStoredLanguage(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredLanguage(code: string) {
  localStorage.setItem(STORAGE_KEY, code);
}

i18n.use(initReactI18next).init({
  resources,
  lng: getStoredLanguage() ?? undefined,
  fallbackLng: "en",
  interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
});

export default i18n;
