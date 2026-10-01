// Parser de exports de WhatsApp ("Exportar chat"), sin dependencias: corre igual en el navegador y en el server.
//
// Formatos soportados (con y sin segundos, 24 h o AM/PM, años de 2 o 4 dígitos):
//   iOS      [12/03/24, 14:05:33] Nombre: texto
//   Android  12/03/24 14:05 - Nombre: texto
//            3/12/24, 2:05 PM - Name: text

export type MessageKind = "text" | "media" | "deleted" | "system";
export type ExportFormat = "ios" | "android";
export type ChatLanguage = "es" | "en" | "unknown";
export type DateOrder = "DMY" | "MDY" | "YMD";

export type ChatMessage = {
  ts: number;
  author: string | null;
  text: string;
  kind: MessageKind;
};

export type ParsedChat = {
  fileName: string;
  /** null si el archivo no parece un export de WhatsApp. */
  format: ExportFormat | null;
  language: ChatLanguage;
  dateOrder: DateOrder;
  messages: ChatMessage[];
  /** Autores con mensajes de texto o multimedia, de más a menos mensajes. */
  participants: { name: string; messages: number }[];
  isGroup: boolean;
};

const DATE = String.raw`(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})`;
const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?\s?m\.?)?`;
const HEADERS: Record<ExportFormat, RegExp> = {
  ios: new RegExp(String.raw`^\[${DATE},?\s+${TIME}\]\s?(.*)$`, "is"),
  android: new RegExp(String.raw`^${DATE},?\s+${TIME}\s+[-–]\s(.*)$`, "is"),
};

// Marcas invisibles de dirección (LRM/RLM y similares) que WhatsApp mete en iOS.
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;

const MEDIA = [
  /^<?\s*(multimedia omitido|media omitted)\s*>?$/i,
  /^(imagen|image|audio|video|vídeo|sticker|gif|documento|document|tarjeta de contacto|contact card) (omitid[oa]|omitted)$/i,
  /^<(adjunto|attached): .+>$/i,
  /\((archivo adjunto|file attached)\)$/i,
  /^(ubicación|location): https?:\/\//i,
  /^(ubicación en tiempo real compartida|live location shared)/i,
];
const DELETED =
  /^(se eliminó este mensaje|este mensaje fue eliminado|eliminaste este mensaje|this message was deleted|you deleted this message)\.?$/i;
const SYSTEM = [
  /cifrados de extremo a extremo|end-to-end encrypted/i,
  /cuenta de empresa|business account/i,
  /^(llamada|videollamada)( de (voz|video))? perdida/i,
  /^missed (voice|video) call/i,
  /mensajes temporales|disappearing messages/i,
  /^(esperando este mensaje|waiting for this message)/i,
  /^null$/i,
];
const EDITED = /\s*<(se editó este mensaje\.?|this message was edited|mensaje editado)>$/i;

const ES_WORDS =
  /\b(omitido|omitida|cifrados|hola|gracias|que|para|está|tenés|tengo|buenas|dale|sí|cuánto|quiero|envío)\b/gi;
const EN_WORDS = /\b(omitted|encrypted|hello|hi|thanks|the|you|is|for|yes|how|much|want|shipping)\b/gi;

type RawMessage = {
  parts: [number, number, number];
  firstLen: number;
  h: number;
  mi: number;
  s: number;
  ampm: "a" | "p" | null;
  author: string | null;
  text: string;
};

function normalizeLine(line: string): string {
  return line.replace(INVISIBLE, "").replace(/[  ]/g, " ");
}

function detectFormat(lines: string[]): ExportFormat | null {
  let ios = 0;
  let android = 0;
  for (const line of lines.slice(0, 400)) {
    if (HEADERS.ios.test(line)) ios++;
    else if (HEADERS.android.test(line)) android++;
  }
  if (ios === 0 && android === 0) return null;
  return ios >= android ? "ios" : "android";
}

function splitAuthor(rest: string): { author: string | null; text: string } {
  const m = /^([^:\n]{1,80}?):(?:\s(.*))?$/s.exec(rest);
  if (!m) return { author: null, text: rest.trim() };
  return { author: m[1].trim(), text: (m[2] ?? "").trim() };
}

function detectLanguage(texts: string[]): ChatLanguage {
  let es = 0;
  let en = 0;
  for (const t of texts.slice(0, 2000)) {
    es += t.match(ES_WORDS)?.length ?? 0;
    en += t.match(EN_WORDS)?.length ?? 0;
  }
  if (es + en < 3) return "unknown";
  return es >= en ? "es" : "en";
}

function detectDateOrder(raw: RawMessage[], language: ChatLanguage): DateOrder {
  if (raw.some((r) => r.firstLen === 4)) return "YMD";
  if (raw.some((r) => r.parts[0] > 12)) return "DMY";
  if (raw.some((r) => r.parts[1] > 12)) return "MDY";
  // Ambiguo (todos los días ≤ 12): en inglés con AM/PM suele ser formato de EE. UU.
  return language === "en" && raw.some((r) => r.ampm) ? "MDY" : "DMY";
}

function toTimestamp(r: RawMessage, order: DateOrder): number {
  const [a, b, c] = r.parts;
  let [y, m, d] = order === "YMD" ? [a, b, c] : order === "DMY" ? [c, b, a] : [c, a, b];
  if (y < 100) y += 2000;
  let h = r.h;
  if (r.ampm) h = (h % 12) + (r.ampm === "p" ? 12 : 0);
  return new Date(y, m - 1, d, h, r.mi, r.s).getTime();
}

export function classify(author: string | null, text: string): { kind: MessageKind; text: string } {
  const clean = text.replace(EDITED, "").trim();
  if (!author || SYSTEM.some((re) => re.test(clean))) return { kind: "system", text: clean };
  if (DELETED.test(clean)) return { kind: "deleted", text: clean };
  if (MEDIA.some((re) => re.test(clean))) return { kind: "media", text: clean };
  return { kind: "text", text: clean };
}

export function parseExport(content: string, fileName: string): ParsedChat {
  const lines = content.split(/\r?\n/).map(normalizeLine);
  const format = detectFormat(lines);
  const empty: ParsedChat = {
    fileName,
    format,
    language: "unknown",
    dateOrder: "DMY",
    messages: [],
    participants: [],
    isGroup: false,
  };
  if (!format) return empty;

  const header = HEADERS[format];
  const raw: RawMessage[] = [];
  for (const line of lines) {
    const m = header.exec(line);
    if (m) {
      const { author, text } = splitAuthor(m[8]);
      raw.push({
        parts: [Number(m[1]), Number(m[2]), Number(m[3])],
        firstLen: m[1].length,
        h: Number(m[4]),
        mi: Number(m[5]),
        s: m[6] ? Number(m[6]) : 0,
        ampm: m[7] ? (m[7].toLowerCase() as "a" | "p") : null,
        author,
        text,
      });
    } else if (raw.length > 0) {
      // Línea de continuación de un mensaje con saltos de línea.
      raw[raw.length - 1].text += `\n${line}`;
    }
  }

  const language = detectLanguage(raw.map((r) => r.text));
  const dateOrder = detectDateOrder(raw, language);
  const messages: ChatMessage[] = raw.map((r) => {
    const { kind, text } = classify(r.author, r.text.trim());
    return { ts: toTimestamp(r, dateOrder), author: kind === "system" ? null : r.author, text, kind };
  });

  const counts = new Map<string, number>();
  for (const msg of messages) {
    if (msg.author && (msg.kind === "text" || msg.kind === "media")) {
      counts.set(msg.author, (counts.get(msg.author) ?? 0) + 1);
    }
  }
  const participants = [...counts]
    .map(([name, n]) => ({ name, messages: n }))
    .sort((a, b) => b.messages - a.messages);

  return { ...empty, language, dateOrder, messages, participants, isGroup: participants.length > 2 };
}
