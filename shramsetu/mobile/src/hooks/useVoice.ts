import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import { useCallback, useRef, useState } from "react";
import { getLanguage } from "../i18n/languages";
import { api } from "../api/client";

/**
 * Voice I/O for the mobile app.
 *
 * TTS: expo-speech, on-device, works everywhere Expo Go runs.
 *
 * STT: reliable on-device speech recognition needs a native module (e.g.
 * @react-native-voice/voice) that requires a custom dev client — it does
 * NOT run inside plain Expo Go. Instead, this records audio locally with
 * expo-av and uploads it to the backend's /chat/transcribe endpoint, which
 * transcribes it via Groq's free-tier Whisper API (the same API key already
 * used for the chatbot). This works in Expo Go with zero extra native
 * modules or paid services, at the cost of a short round-trip once you stop
 * recording (not real-time streaming transcription).
 */
export function useVoice(languageCode: string) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const speechLocale = getLanguage(languageCode).speechLocale;

  const speak = useCallback(
    (text: string) => {
      Speech.stop();
      setIsSpeaking(true);
      Speech.speak(text, {
        language: speechLocale,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    },
    [speechLocale]
  );

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) return false;

    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    setIsRecording(true);
    return true;
  }, []);

  const stopRecordingAndTranscribe = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;

    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recordingRef.current = null;
    if (!uri) return null;

    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append("file", { uri, name: "recording.m4a", type: "audio/m4a" } as any);
      const res = await api.post(
        `/chat/transcribe?language=${encodeURIComponent(languageCode)}`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return res.data.text as string;
    } finally {
      setIsTranscribing(false);
    }
  }, [languageCode]);

  const cancelRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      /* already stopped */
    }
    recordingRef.current = null;
  }, []);

  return {
    isSpeaking,
    speak,
    stopSpeaking,
    isRecording,
    isTranscribing,
    startRecording,
    stopRecordingAndTranscribe,
    cancelRecording,
  };
}
