import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { BottomNav } from "../components/BottomNav";
import { VoiceRecorder } from "../components/VoiceRecorder";
import { api } from "../api/client";
import type { ChatAnswer, ChatHistoryItem } from "../types";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  meta?: ChatAnswer;
}

export default function ChatbotPage() {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [assistantUnavailable, setAssistantUnavailable] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<ChatHistoryItem[]>("/chat/history").then((res) => {
      const loaded: DisplayMessage[] = res.data.map((item) => ({
        role: item.role,
        text: item.content,
        meta: item.meta ?? undefined,
      }));
      setMessages(loaded);
      if (loaded.some((m) => m.meta?.system_error)) setAssistantUnavailable(true);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, asking]);

  const sendQuestion = async (question: string) => {
    if (!question.trim() || asking) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setAsking(true);
    try {
      const res = await api.post<ChatAnswer>("/chat/ask", { question, language: i18n.language });
      setMessages((prev) => [...prev, { role: "assistant", text: res.data.answer, meta: res.data }]);
      setAssistantUnavailable(Boolean(res.data.system_error));
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: t("common.error") }]);
    } finally {
      setAsking(false);
    }
  };

  const handleVoiceResult = (text: string) => {
    setVoiceError(null);
    sendQuestion(text);
  };

  const handleVoiceError = (msg: string) => {
    setVoiceError(msg);
  };

  const clearChat = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await api.delete("/chat/history");
    } catch {
      // Even if the server call fails, clear locally so the UI stays usable.
    }
    setMessages([]);
    setAssistantUnavailable(false);
    setClearing(false);
  };

  /** TTS: try browser speechSynthesis first, fall back to server-side /chat/speak */
  const handleSpeak = async (text: string, idx: number) => {
    // If already speaking this one, stop everything
    if (speakingIdx === idx) {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingIdx(null);
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis?.cancel();
    setSpeakingIdx(idx);

    const localeMap: Record<string, string> = {
      en: "en-IN",
      hi: "hi-IN",
      bn: "bn-IN",
      te: "te-IN",
      ta: "ta-IN",
      ml: "ml-IN",
    };
    const lang = i18n.language;
    const speechLocale = localeMap[lang] || "en-IN";

    // Try browser TTS first
    if ("speechSynthesis" in window) {
      const voices = window.speechSynthesis.getVoices();
      const base = speechLocale.split("-")[0];
      const voice =
        voices.find((v) => v.lang === speechLocale) ||
        voices.find((v) => v.lang.startsWith(base));

      if (voice) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = speechLocale;
        utterance.voice = voice;
        utterance.rate = 0.9;
        utterance.onend = () => setSpeakingIdx(null);
        utterance.onerror = () => {
          setSpeakingIdx(null);
          // Fallback to server-side TTS
          serverSpeak(text, lang, idx);
        };
        window.speechSynthesis.speak(utterance);
        return;
      }
    }

    // Fallback: server-side TTS
    serverSpeak(text, lang, idx);
  };

  /** Server-side TTS fallback using /chat/speak endpoint */
  const serverSpeak = async (text: string, lang: string, idx: number) => {
    try {
      // Stop any previous playback
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      setSpeakingIdx(idx);
      const res = await api.get("/chat/speak", {
        params: { text: text.substring(0, 500), language: lang },
        responseType: "blob",
      });
      const audioUrl = URL.createObjectURL(res.data);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        setSpeakingIdx(null);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        audioRef.current = null;
        setSpeakingIdx(null);
        URL.revokeObjectURL(audioUrl);
        setVoiceError("Text-to-speech failed. Your device may not have this language voice pack.");
      };
      await audio.play();
    } catch {
      audioRef.current = null;
      setSpeakingIdx(null);
      setVoiceError("Text-to-speech is not available for this language on your device.");
    }
  };

  return (
    <>
      <Screen title={t("chat.title")}>
        {messages.length > 0 && (
          <div className="flex justify-end mb-2 -mt-2">
            <button
              onClick={clearChat}
              disabled={clearing}
              className="text-xs font-medium text-gray-400 hover:text-red-500 disabled:opacity-50 flex items-center gap-1 transition"
            >
              🗑 {clearing ? "..." : t("chat.clearHistory")}
            </button>
          </div>
        )}
        {assistantUnavailable && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            {t("chat.assistantUnavailable")}
          </div>
        )}
        <div
          ref={scrollRef}
          className="overflow-y-auto pb-40"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          {messages.length === 0 && (
            <p className="text-gray-400 text-center py-10 text-sm">
              {t("chat.emptyState")}
            </p>
          )}
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <ChatBubble
                key={i}
                msg={msg}
                idx={i}
                onSpeak={handleSpeak}
                isSpeaking={speakingIdx === i}
              />
            ))}
            {asking && (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <span className="animate-pulse">...</span> {t("chat.thinking")}
              </div>
            )}
          </div>
        </div>
        <div className="fixed bottom-16 left-0 right-0 bg-gray-50 dark:bg-gray-900 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="max-w-md mx-auto">
            {voiceError && (
              <p className="text-red-500 text-xs mb-2 flex items-center gap-1">
                {voiceError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <VoiceRecorder
                language={i18n.language}
                onTranscript={handleVoiceResult}
                onError={handleVoiceError}
              />
              <input
                className="input-field flex-1"
                placeholder={t("chat.placeholder")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendQuestion(input)}
              />
              <button
                onClick={() => sendQuestion(input)}
                disabled={!input.trim() || asking}
                className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center text-lg shrink-0 disabled:opacity-40 transition hover:bg-brand-700 active:scale-95"
              >
                {t("chat.send")}
              </button>
            </div>
          </div>
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}

function ChatBubble({
  msg,
  idx,
  onSpeak,
  isSpeaking,
}: {
  msg: DisplayMessage;
  idx: number;
  onSpeak: (text: string, idx: number) => void;
  isSpeaking: boolean;
}) {
  const { t } = useTranslation();
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isUser
            ? "bg-brand-600 text-white rounded-br-sm"
            : "bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-bl-sm"
        }`}
      >
        <p className={isUser ? "" : "text-gray-900 dark:text-gray-100"}>
          {msg.text}
        </p>
        {!isUser && msg.meta && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
            {msg.meta.system_error ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {t("chat.assistantUnavailable")}
              </p>
            ) : msg.meta.grounded ? (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                  {msg.meta.simple_explanation}
                </p>
                {msg.meta.source_document && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">
                      {t("chat.sourceDocument")}:
                    </span>{" "}
                    {msg.meta.source_document}
                  </p>
                )}
                {msg.meta.government_department && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">
                      {t("chat.department")}:
                    </span>{" "}
                    {msg.meta.government_department}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">
                    {t("chat.confidence")}:
                  </span>{" "}
                  {Math.round(msg.meta.confidence_score * 100)}%
                </p>
                {msg.meta.last_updated_date && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">
                      {t("chat.lastUpdated")}:
                    </span>{" "}
                    {msg.meta.last_updated_date}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {t("chat.notVerified")}
              </p>
            )}
            <button
              onClick={() => onSpeak(msg.text, idx)}
              className={`text-xs font-semibold mt-1 flex items-center gap-1 transition ${
                isSpeaking
                  ? "text-red-500 animate-pulse"
                  : "text-brand-600 dark:text-brand-400"
              }`}
            >
              {isSpeaking
                ? t("chat.stopPlaying")
                : t("chat.playAnswer")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
