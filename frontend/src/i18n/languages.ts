/**
 * Central language registry.
 *
 * The 6 languages below are the Phase-1 seeded/first-class languages (with
 * full translation files and native voice support). The system itself is
 * NOT hardcoded to 6: to add a new language, add its entry here and a
 * matching JSON file in ./locales/<code>.json — nothing else needs to
 * change (routing, RTL-safe layout, and the RAG chatbot already accept an
 * arbitrary IETF language code).
 */
export interface LanguageOption {
  code: string; // IETF language code
  nativeName: string;
  englishName: string;
  speechLocale: string; // BCP-47 tag used by the Web Speech API
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", nativeName: "English", englishName: "English", speechLocale: "en-IN" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", speechLocale: "hi-IN" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali", speechLocale: "bn-IN" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu", speechLocale: "te-IN" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil", speechLocale: "ta-IN" },
  { code: "ml", nativeName: "മലയാളം", englishName: "Malayalam", speechLocale: "ml-IN" },
];

export function getLanguage(code: string): LanguageOption {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}
