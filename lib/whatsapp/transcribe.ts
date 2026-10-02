"use client";

import { type VoiceNote, uploadName } from "./voice";

// Transcribe las notas de voz desde el navegador: una por request, 3 en paralelo.
// Si Groq pide esperar (límite del plan gratis), espera y sigue; si falta la key, corta todo.

export type TranscribeProgress = { done: number; total: number; failed: number; seconds: number; waiting: boolean };

export class TranscribeError extends Error {
  constructor(public code: "missing_stt_key" | "unauthorized" | "generic", detail = "") {
    super(detail || code);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function one(note: VoiceNote, language: "es" | "en" | undefined, onWait: (w: boolean) => void) {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append("file", new Blob([note.bytes as BlobPart]), uploadName(note.file));
    form.append("name", uploadName(note.file));
    if (language) form.append("language", language);
    const res = await fetch("/api/transcribe", { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) return data as { text: string; seconds: number };
    if (data.error === "missing_stt_key" || data.error === "unauthorized") throw new TranscribeError(data.error);
    // Límite de Groq: esperar un rato y reintentar, varias veces.
    if (data.error === "rate_limited" && attempt < 6) {
      onWait(true);
      await sleep(20_000);
      onWait(false);
      continue;
    }
    throw new TranscribeError("generic", data.detail ?? data.error ?? (res ? `HTTP ${res.status}` : "network"));
  }
}

export async function transcribeAll(
  notes: VoiceNote[],
  language: "es" | "en" | undefined,
  onResult: (id: string, text: string) => void,
  onProgress: (p: TranscribeProgress) => void,
): Promise<TranscribeProgress> {
  const p: TranscribeProgress = { done: 0, total: notes.length, failed: 0, seconds: 0, waiting: false };
  onProgress({ ...p });
  let next = 0;
  let fatal: TranscribeError | null = null;
  const worker = async () => {
    while (next < notes.length && !fatal) {
      const note = notes[next++];
      try {
        const r = await one(note, language, (waiting) => onProgress({ ...p, waiting }));
        if (r.text) onResult(note.id, r.text);
        p.seconds += r.seconds;
      } catch (err) {
        if (err instanceof TranscribeError && err.code !== "generic") fatal = err;
        else p.failed++;
      }
      p.done++;
      onProgress({ ...p });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, notes.length) }, worker));
  if (fatal) throw fatal;
  return p;
}
