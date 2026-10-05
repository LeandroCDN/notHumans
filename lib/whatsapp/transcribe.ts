"use client";

import { limitFrom, refreshMe } from "@/lib/me";
import { type VoiceNote, uploadName } from "./voice";

// Transcribe las notas de voz desde el navegador: una por request, 3 en paralelo.
// Si Groq pide esperar (límite del plan gratis), espera y sigue; si falta la key, corta todo.

export class TranscribeError extends Error {
  constructor(
    /** "limit": se terminaron los minutos de audio del plan. */
    public code: "missing_stt_key" | "unauthorized" | "limit" | "generic",
    detail = "",
  ) {
    super(detail || code);
  }
}

export type TranscribeHandlers = {
  onResult: (note: VoiceNote, text: string, seconds: number) => void;
  onFailed: (note: VoiceNote) => void;
  onWaiting: (waiting: boolean) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function one(note: VoiceNote, language: "es" | "en" | undefined, onWaiting: (w: boolean) => void) {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append("file", new Blob([note.bytes as BlobPart]), uploadName(note.file));
    form.append("name", uploadName(note.file));
    if (language) form.append("language", language);
    const res = await fetch("/api/transcribe", { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) return data as { text: string; seconds: number };
    if (data.error === "missing_stt_key" || data.error === "unauthorized") throw new TranscribeError(data.error);
    const limit = limitFrom(data);
    if (limit) throw new TranscribeError("limit", limit.kind);
    // Límite de Groq: esperar un rato y reintentar, varias veces.
    if (data.error === "rate_limited" && attempt < 6) {
      onWaiting(true);
      await sleep(20_000);
      onWaiting(false);
      continue;
    }
    throw new TranscribeError("generic", data.detail ?? data.error ?? (res ? `HTTP ${res.status}` : "network"));
  }
}

/** Transcribe todas; si falla una sigue con el resto. Un error de configuración corta todo y se relanza. */
export async function transcribeAll(notes: VoiceNote[], language: "es" | "en" | undefined, h: TranscribeHandlers) {
  let next = 0;
  let fatal: TranscribeError | null = null;
  const worker = async () => {
    while (next < notes.length && !fatal) {
      const note = notes[next++];
      try {
        const r = await one(note, language, h.onWaiting);
        h.onResult(note, r.text, r.seconds);
      } catch (err) {
        if (err instanceof TranscribeError && err.code !== "generic") fatal = err;
        else h.onFailed(note);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, notes.length) }, worker));
  refreshMe();
  if (fatal) throw fatal;
}
