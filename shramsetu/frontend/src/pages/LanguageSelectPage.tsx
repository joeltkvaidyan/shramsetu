import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n/languages";
import { setStoredLanguage } from "../i18n/index";

export default function LanguageSelectPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  // Default to English if no language is selected yet
  const [selected, setSelected] = useState(() => {
    const stored = localStorage.getItem("shramsetu.language");
    return stored || "en";
  });

  const handleContinue = () => {
    i18n.changeLanguage(selected);
    setStoredLanguage(selected);
    localStorage.setItem("shramsetu.onboarded_language", "true");
    navigate("/roles");
  };

  // Language selection screen always displays in English
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-600 to-brand-800 flex flex-col justify-center px-6 py-10">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center text-4xl">
          🤝
        </div>
        <h1 className="text-3xl font-bold text-white">ShramSetu</h1>
        <p className="text-brand-100 mt-2 text-base">Choose your language</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setSelected(lang.code)}
            className={`rounded-2xl px-4 py-5 text-left transition active:scale-[0.97] ${
              selected === lang.code
                ? "bg-white text-brand-800 shadow-lg ring-2 ring-white"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <div className="text-xl font-semibold">{lang.nativeName}</div>
            <div className="text-sm opacity-80">{lang.englishName}</div>
          </button>
        ))}
      </div>

      <button onClick={handleContinue} className="btn-primary bg-white !text-brand-800 hover:!bg-brand-50">
        Continue
      </button>
      <p className="text-center text-brand-100 text-sm mt-4">You can change this anytime in Settings</p>
    </div>
  );
}
