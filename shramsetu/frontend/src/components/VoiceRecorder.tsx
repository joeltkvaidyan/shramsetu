import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

/**
 * VoiceRecorder v14 — Raw PCM capture → client-side WAV encoding → Groq Whisper.
 *
 * Why not MediaRecorder? The webm/opus blobs it produces are rejected by
 * Groq as "invalid media file" on some Android WebView/browser combos.
 * Raw PCM → WAV has zero codec ambiguity and works on every phone browser.
 *
 * Flow:
 *   1. getUserMedia audio
 *   2. AudioContext (downsampled to 16 kHz mono) collects Float32 PCM
 *   3. On stop: compute RMS; if silence → clear error, no upload
 *   4. Encode 16-bit WAV in the browser
 *   5. POST /chat/transcribe?language=xx
 */

const TARGET_SAMPLE_RATE = 16000;

interface VoiceRecorderProps {
  language: string;
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
}

export function VoiceRecorder({ language, onTranscript, onError }: VoiceRecorderProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"idle" | "recording" | "transcribing">("idle");
  const [noMicSupport, setNoMicSupport] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const modeRef = useRef<"idle" | "recording" | "transcribing">("idle");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Check mic support on mount (HTTPS required for mediaDevices)
  useEffect(() => {
    const ok = !!navigator.mediaDevices?.getUserMedia;
    if (!ok) {
      setNoMicSupport(true);
      console.warn("[VoiceRecorder] navigator.mediaDevices unavailable — HTTPS required");
    }
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopEverything = useCallback(() => {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    processorRef.current = null;
    sourceRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setMode("idle");
  }, []);

  /** Encode Float32 mono PCM to a 16-bit WAV blob. */
  const encodeWav = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);          // PCM chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, 1, true);           // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);           // block align
    view.setUint16(34, 16, true);          // bits per sample
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  };

  const startRecording = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError?.("Voice input requires HTTPS. Open the app with https:// in the address bar.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      chunksRef.current = [];

      // ScriptProcessorNode is deprecated but universally supported —
      // the pragmatic choice for maximum phone compatibility.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (modeRef.current !== "recording") return;
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      setMode("recording");
    } catch (err: any) {
      console.error("[VoiceRecorder] mic error:", err?.name, err?.message);
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        onError?.(t("voice.errors.micPermission"));
      } else if (err?.name === "NotFoundError") {
        onError?.("No microphone found on this device.");
      } else {
        onError?.(t("voice.errors.recognitionFailed"));
      }
      stopEverything();
    }
  }, [onError, t, stopEverything]);

  const stopAndTranscribe = useCallback(async () => {
    // Detach audio graph first so onaudioprocess stops
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}

    // Merge all PCM chunks
    const total = chunksRef.current.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunksRef.current) {
      merged.set(c, off);
      off += c.length;
    }
    chunksRef.current = [];

    const rawRate = sampleRateRef.current;

    // Release mic immediately
    stopEverything();

    // Silence / noise-gate detection: RMS + peak over the raw capture.
    // Ambient room noise (fans, traffic) has low peak amplitude; real
    // speech close to the mic produces peaks near 0.3-0.9.
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < merged.length; i++) {
      const v = merged[i];
      sumSq += v * v;
      const av = v < 0 ? -v : v;
      if (av > peak) peak = av;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, merged.length));
    const durationSec = merged.length / rawRate;

    if (durationSec < 0.7 || rms < 0.004 || peak < 0.05) {
      onError?.(t("voice.errors.noSpeech"));
      return;
    }

    // Downsample to 16 kHz mono (simple decimation — fine for speech)
    let samples = merged;
    let rate = rawRate;
    if (rawRate > TARGET_SAMPLE_RATE) {
      const ratio = rawRate / TARGET_SAMPLE_RATE;
      const outLen = Math.floor(merged.length / ratio);
      const down = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        down[i] = merged[Math.floor(i * ratio)];
      }
      samples = down;
      rate = TARGET_SAMPLE_RATE;
    }

    const wav = encodeWav(samples, rate);
    setMode("transcribing");

    try {
      const formData = new FormData();
      formData.append("file", wav, "recording.wav");

      // Do NOT set Content-Type manually — the browser must add the
      // multipart boundary, otherwise FastAPI rejects the upload.
      const res = await api.post(
        `/chat/transcribe?language=${encodeURIComponent(language)}`,
        formData,
        { timeout: 45000 }
      );

      const text: string = res.data?.text || "";
      if (text.trim()) {
        onTranscript(text.trim());
      } else {
        onError?.(t("voice.errors.noSpeech"));
      }
    } catch (err: any) {
      console.error("[VoiceRecorder] transcription error:", err?.response?.status, err?.message);
      if (err?.response?.status === 503) {
        onError?.("Voice service not configured. Set GROQ_API_KEY in backend/.env");
      } else if (err?.response?.status === 401) {
        onError?.("Please login first to use voice input.");
      } else if (err?.response?.status === 400) {
        onError?.("Recording was not usable. Please speak a bit louder and try again.");
      } else {
        onError?.(t("voice.errors.recognitionFailed"));
      }
    } finally {
      setMode("idle");
    }
  }, [language, onTranscript, onError, t, stopEverything]);

  const toggleRecording = useCallback(() => {
    if (mode === "transcribing") return;
    if (mode === "recording") {
      stopAndTranscribe();
      return;
    }
    if (noMicSupport) {
      onError?.("Voice input requires HTTPS. Open this page using https:// instead of http://");
      return;
    }
    startRecording();
  }, [mode, noMicSupport, startRecording, stopAndTranscribe, onError]);

  return (
    <div className="relative flex flex-col items-center gap-1">
      {noMicSupport && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-white text-xs px-3 py-2 rounded-xl shadow-lg whitespace-nowrap z-50">
          🔒 HTTPS required for voice on phone
        </div>
      )}
      <button
        onClick={toggleRecording}
        disabled={mode === "transcribing"}
        aria-label={mode === "recording" ? "Stop recording" : "Start voice input"}
        className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 transition-all duration-200 ${
          mode === "recording"
            ? "bg-red-500 text-white animate-pulse scale-110 shadow-lg shadow-red-500/30"
            : mode === "transcribing"
            ? "bg-yellow-500 text-white animate-spin"
            : "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-900/70 active:scale-95"
        }`}
      >
        {mode === "recording" ? "⏹" : mode === "transcribing" ? "⏳" : "🎤"}
      </button>
      {mode === "recording" && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900/85 text-white text-xs px-3 py-1.5 rounded-full whitespace-nowrap z-50">
          {t("voice.errors.listening") || "Listening… tap ⏹ when done"}
        </div>
      )}
    </div>
  );
}
