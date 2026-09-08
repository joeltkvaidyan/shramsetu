import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useVoice } from "../hooks/useVoice";
import type { ChatAnswer, ChatHistoryItem } from "../types";

interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  meta?: ChatAnswer;
}

export default function ChatbotScreen() {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const {
    isSpeaking,
    speak,
    stopSpeaking,
    isRecording,
    isTranscribing,
    startRecording,
    stopRecordingAndTranscribe,
  } = useVoice(i18n.language);

  useEffect(() => {
    api.get<ChatHistoryItem[]>("/chat/history").then((res) => {
      setMessages(res.data.map((item) => ({ role: item.role, text: item.content, meta: item.meta ?? undefined })));
    });
  }, []);

  const sendQuestion = async (question: string) => {
    if (!question.trim() || asking) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setAsking(true);
    try {
      const res = await api.post<ChatAnswer>("/chat/ask", { question, language: i18n.language });
      setMessages((prev) => [...prev, { role: "assistant", text: res.data.answer, meta: res.data }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: t("common.error") }]);
    } finally {
      setAsking(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleMicPress = async () => {
    if (isRecording) {
      const transcript = await stopRecordingAndTranscribe();
      if (transcript) {
        sendQuestion(transcript);
      } else if (transcript === null) {
        Alert.alert(t("common.error"));
      }
      return;
    }
    const started = await startRecording();
    if (!started) {
      Alert.alert("Microphone permission needed", "Allow microphone access to ask questions by voice.");
    }
  };

  return (
    <Screen title={t("chat.title")} scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1" keyboardVerticalOffset={90}>
        <ScrollView ref={scrollRef} className="flex-1" onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 && (
            <Text className="text-gray-400 text-center py-10 text-sm">{t("chat.emptyState")}</Text>
          )}
          <View className="gap-4 pb-4">
            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} isSpeaking={isSpeaking} onSpeak={speak} onStopSpeak={stopSpeaking} />
            ))}
            {asking && <Text className="text-gray-400 text-sm">💭 {t("chat.thinking")}</Text>}
            {isTranscribing && <Text className="text-gray-400 text-sm">🎤 {t("chat.listening")}</Text>}
          </View>
        </ScrollView>

        <View className="flex-row items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
          <TouchableOpacity
            onPress={handleMicPress}
            disabled={isTranscribing}
            className={`w-12 h-12 rounded-full items-center justify-center ${
              isRecording ? "bg-red-500" : "bg-brand-100 dark:bg-brand-900/40"
            }`}
          >
            <Text className="text-lg">{isRecording ? "⏹" : "🎤"}</Text>
          </TouchableOpacity>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("chat.placeholder")}
            placeholderTextColor="#9ca3af"
            onSubmitEditing={() => sendQuestion(input)}
            className="flex-1 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-gray-900 dark:text-gray-100"
          />
          <TouchableOpacity
            onPress={() => sendQuestion(input)}
            disabled={!input.trim() || asking}
            className={`w-12 h-12 rounded-full items-center justify-center ${
              !input.trim() || asking ? "bg-gray-300 dark:bg-gray-700" : "bg-brand-600"
            }`}
          >
            <Text className="text-white text-lg">➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ChatBubble({
  msg,
  isSpeaking,
  onSpeak,
  onStopSpeak,
}: {
  msg: DisplayMessage;
  isSpeaking: boolean;
  onSpeak: (text: string) => void;
  onStopSpeak: () => void;
}) {
  const { t } = useTranslation();
  const isUser = msg.role === "user";

  return (
    <View className={`flex-row ${isUser ? "justify-end" : "justify-start"}`}>
      <View
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser ? "bg-brand-600 rounded-br-sm" : "bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-bl-sm"
        }`}
      >
        <Text className={isUser ? "text-white" : "text-gray-900 dark:text-gray-100"}>{msg.text}</Text>

        {!isUser && msg.meta && (
          <View className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 gap-1">
            {msg.meta.grounded ? (
              <>
                <Text className="text-xs text-gray-500 dark:text-gray-400 italic">{msg.meta.simple_explanation}</Text>
                {msg.meta.source_document && <MetaRow label={t("chat.sourceDocument")} value={msg.meta.source_document} />}
                {msg.meta.government_department && <MetaRow label={t("chat.department")} value={msg.meta.government_department} />}
                <MetaRow label={t("chat.confidence")} value={`${Math.round(msg.meta.confidence_score * 100)}%`} />
                {msg.meta.last_updated_date && <MetaRow label={t("chat.lastUpdated")} value={msg.meta.last_updated_date} />}
              </>
            ) : (
              <Text className="text-xs text-amber-600 dark:text-amber-400 font-medium">⚠ {t("chat.notVerified")}</Text>
            )}
            <TouchableOpacity onPress={() => (isSpeaking ? onStopSpeak() : onSpeak(msg.text))} className="mt-1">
              <Text className="text-xs text-brand-600 dark:text-brand-400 font-semibold">
                {isSpeaking ? `⏹ ${t("chat.stopPlaying")}` : `🔊 ${t("chat.playAnswer")}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <Text className="text-xs text-gray-500 dark:text-gray-400">
      <Text className="font-semibold">{label}: </Text>
      {value}
    </Text>
  );
}
