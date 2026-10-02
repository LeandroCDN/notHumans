import type { ChatMessage, ParsedChat } from "./parse";

// Notas de voz: cuando el chat se exporta "con multimedia", los audios vienen en el .zip.
// Se transcriben y entran a la conversación como texto marcado con 🎤, así el modelo sabe que era un audio.

export const VOICE_PREFIX = "🎤 ";
export const AUDIO_FILE = /\.(opus|ogg|oga|m4a|mp3|aac|wav|amr|webm)$/i;
/** "audio omitido" / "audio omitted": había un audio pero se exportó sin multimedia. */
const OMITTED_AUDIO = /^(audio|nota de voz|voice message) (omitid[oa]|omitted)$/i;

export type VoiceNote = {
  /** Identifica el audio entre todos los archivos subidos: clave del archivo + nombre del adjunto. */
  id: string;
  file: string;
  author: string;
  bytes: Uint8Array;
};

export const voiceId = (entryKey: string, file: string) => `${entryKey}|${file}`;

/** Los audios de un chat que efectivamente vinieron en el .zip. */
export function voiceNotes(chat: ParsedChat, entryKey: string, audios: Record<string, Uint8Array>): VoiceNote[] {
  const out: VoiceNote[] = [];
  for (const m of chat.messages) {
    if (m.kind !== "media" || !m.attachment || !m.author || !AUDIO_FILE.test(m.attachment)) continue;
    const bytes = audios[m.attachment];
    if (bytes) out.push({ id: voiceId(entryKey, m.attachment), file: m.attachment, author: m.author, bytes });
  }
  return out;
}

/** Audios que se mencionan en el chat pero no vinieron (exportado sin multimedia). */
export function missingVoiceNotes(chat: ParsedChat, audios: Record<string, Uint8Array>): number {
  return chat.messages.filter(
    (m) =>
      m.kind === "media" &&
      (OMITTED_AUDIO.test(m.text) || (m.attachment && AUDIO_FILE.test(m.attachment) && !audios[m.attachment])),
  ).length;
}

/** Reemplaza cada audio transcripto por su texto (con 🎤). Los demás quedan como multimedia. */
export function withTranscripts(chat: ParsedChat, entryKey: string, transcripts: Record<string, string>): ParsedChat {
  let changed = false;
  const messages = chat.messages.map((m): ChatMessage => {
    const text = m.attachment ? transcripts[voiceId(entryKey, m.attachment)]?.trim() : undefined;
    if (m.kind !== "media" || !text) return m;
    changed = true;
    return { ...m, kind: "text", text: VOICE_PREFIX + text };
  });
  return changed ? { ...chat, messages } : chat;
}

/** Whisper no siempre acepta la extensión .opus: los de WhatsApp son Ogg, así que se mandan como .ogg. */
export function uploadName(file: string): string {
  return file.replace(/\.(opus|oga)$/i, ".ogg");
}

/** Estimación de duración: las notas de voz de WhatsApp (Opus) andan por ~2 KB por segundo. */
export function estimateSeconds(bytes: number): number {
  return Math.max(1, Math.round(bytes / 2000));
}
