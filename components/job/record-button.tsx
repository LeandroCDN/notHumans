"use client";

import { motion } from "motion/react";
import { useRef, useState } from "react";
import { useI18n } from "../i18n";

// Graba un audio con el micrófono y lo transcribe con /api/transcribe (Groq Whisper, como las notas de voz).

export function RecordButton({ lang, onText }: { lang: "es" | "en"; onText: (text: string) => void }) {
  const { t: dict } = useI18n();
  const t = dict.jobs.brief;
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t.micDenied);
      return;
    }
    const rec = new MediaRecorder(stream);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      void transcribe(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
    };
    recorder.current = rec;
    rec.start();
    setState("recording");
  }

  async function transcribe(blob: Blob) {
    setState("transcribing");
    // Safari graba en mp4; Chrome y Firefox en webm/ogg. Whisper acepta los tres.
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("file", blob, `brief.${ext}`);
    form.append("name", `brief.${ext}`);
    form.append("language", lang);
    const res = await fetch("/api/transcribe", { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.text) onText(data.text);
    else {
      const errors = dict.create.voice.errors;
      setError(
        data.error === "missing_stt_key" || data.error === "unauthorized"
          ? errors[data.error as "missing_stt_key" | "unauthorized"]
          : errors.generic(data.detail ?? data.error ?? "network"),
      );
    }
    setState("idle");
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        disabled={state === "transcribing"}
        onClick={() => (state === "recording" ? recorder.current?.stop() : void start())}
        className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition disabled:opacity-60 ${
          state === "recording"
            ? "border-rose/60 bg-rose/15 text-rose"
            : "border-violet/50 bg-violet/15 text-violet-100 hover:bg-violet/25"
        }`}
      >
        {state === "recording" ? (
          <motion.span
            className="size-2.5 rounded-full bg-rose"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
        {state === "recording" ? t.stop : state === "transcribing" ? t.transcribing : t.record}
      </motion.button>
      {error && <span className="text-xs text-rose">{error}</span>}
    </span>
  );
}
