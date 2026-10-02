import "server-only";

// Speech-to-text para las notas de voz. Hoy: Whisper en Groq (DeepSeek no tiene audio).
// API compatible con la de OpenAI, así que cambiar de proveedor es cambiar URL, key y modelo.

const BASE_URL = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
const MODEL = process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo";

export class MissingSttKeyError extends Error {
  constructor() {
    super("GROQ_API_KEY no está configurada en el servidor");
  }
}

export type Transcription = { text: string; seconds: number; model: string };

/** Pista para Whisper: mejora la ortografía del voseo y del lunfardo. */
const PROMPTS = {
  es: "Nota de voz de WhatsApp en español rioplatense, con voseo: vos tenés, dale, che, re.",
  en: "WhatsApp voice note.",
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function transcribe(audio: Blob, fileName: string, language?: "es" | "en"): Promise<Transcription> {
  if (process.env.LLM_MOCK === "1") {
    await sleep(300 + Math.random() * 500);
    const seconds = Math.max(1, Math.round(audio.size / 2000));
    return { text: `(mock) dale, te cuento rápido lo del audio de ${seconds} segundos`, seconds, model: "mock" };
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new MissingSttKeyError();

  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append("file", audio, fileName);
    form.append("model", MODEL);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    if (language) {
      form.append("language", language);
      form.append("prompt", PROMPTS[language]);
    }
    const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    // Límite del plan (por minuto o por hora de audio): esperar lo que diga Groq, con un tope.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Math.min(20_000, (Number.isFinite(after) && after > 0 ? after : 2 ** attempt) * 1000));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as {
      text?: string;
      duration?: number;
      error?: { message?: string };
    };
    if (!res.ok) {
      const err = new Error(`Groq ${res.status}: ${body.error?.message ?? res.statusText}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return { text: (body.text ?? "").trim(), seconds: Math.round(body.duration ?? 0), model: MODEL };
  }
}
