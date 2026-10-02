import { type Conversation, MEDIA_PLACEHOLDER } from "@/lib/whatsapp/analyze";
import type { Example } from "./schema";

// Piezas puras del pipeline de generación: armar bloques, detectar fugas y elegir ejemplos.

/** Una conversación en el formato que lee el modelo. */
export function toTranscript(conv: Conversation, n: number): string {
  const lines = [`=== Conversation ${n} · client: ${conv.client}`];
  for (const turn of conv.turns) {
    const who = turn.role === "owner" ? "OWNER" : "CLIENT";
    for (const t of turn.texts) lines.push(`${who}: ${t === MEDIA_PLACEHOLDER ? "(media)" : t.replace(/\n/g, " / ")}`);
  }
  return lines.join("\n");
}

export const BLOCK_CHARS = 9000;
export const MAX_BLOCKS = 12;

/**
 * Agrupa conversaciones en bloques de ~9000 caracteres (unos 3000 tokens).
 * Si hay demasiadas, se queda con una muestra pareja en el tiempo en vez de las primeras.
 */
export function buildBlocks(conversations: Conversation[]): { blocks: string[]; used: number } {
  const transcripts = conversations.map((c, i) => toTranscript(c, i + 1).slice(0, BLOCK_CHARS));
  const total = transcripts.reduce((n, t) => n + t.length + 2, 0);
  const budget = BLOCK_CHARS * MAX_BLOCKS;

  let picked = transcripts;
  if (total > budget) {
    const keep = Math.max(1, Math.floor((transcripts.length * budget) / total));
    const step = transcripts.length / keep;
    picked = Array.from({ length: keep }, (_, i) => transcripts[Math.floor(i * step)]);
  }

  const blocks: string[] = [];
  let current = "";
  for (const t of picked) {
    if (current && current.length + t.length + 2 > BLOCK_CHARS) {
      blocks.push(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + t;
  }
  if (current) blocks.push(current);
  return { blocks: blocks.slice(0, MAX_BLOCKS), used: picked.length };
}

// Datos concretos que se le pueden haber escapado al modelo al poner marcadores.
// Ojo con el orden: gana el primero que matchea (y es el nombre que se muestra como motivo).

/** Número de calle: 1 a 5 cifras, que no sea un año ni una hora, precio o porcentaje. */
const STREET_NUMBER = String.raw`(?:n[°º.]?\s*)?(?!(?:19|20)\d{2}\b)\d{1,5}\b(?![.,:/]?\d|\s?%|\s?hs\b)`;
/** Palabra de un nombre de calle (con tildes); en mayúscula si no hay otra pista de que es una dirección. */
const WORD = String.raw`[\p{L}][\p{L}.']*`;
const CAPITALIZED = String.raw`\p{Lu}[\p{L}.']*`;

const LEAKS: [string, RegExp][] = [
  ["price", /\$\s?\d/],
  ["amount", /\b\d{1,3}(?:\.\d{3})+\b/],
  ["percent", /\d+\s?%/],
  ["link", /https?:\/\/|www\.|\b\w+\.(?:com|la|ar|net|io)\b/i],
  ["email", /[\w.+-]+@[\w-]+\.\w+/],
  ["tracking", /\b[A-Z]{2}\d{9}[A-Z]{2}\b/],
  // 8 cifras o más, con espacios, guiones, puntos o paréntesis en el medio: +1 (415) 645-3335, 11 2233-4455.
  ["phone", /\+?\(?\d(?:[\s().-]{0,2}\d){7,}/],
  // "av. colón 1234", "calle 12 n° 345", "pasaje las rosas 80".
  [
    "address",
    new RegExp(String.raw`\b(?:av(?:enida)?|avda|calle|pasaje|pje|ruta|diagonal|diag)\.?\s+(?:${WORD}\s+){0,3}${STREET_NUMBER}`, "iu"),
  ],
  // "Rawson 2167", "Carlos Pellegrini 2699": nombre en mayúscula + altura de 3 a 5 cifras.
  ["address", new RegExp(String.raw`(?<![\p{L}\d])${CAPITALIZED}(?:\s+${CAPITALIZED}){0,3}\s+(?=\d{3})${STREET_NUMBER}`, "u")],
  // "rawson 2167 pb", "castelli 1554 2do b": en minúscula, solo si sigue algo de dirección.
  [
    "address",
    new RegExp(String.raw`(?<![\p{L}\d])${WORD}\s+\d{2,5}\s*(?:pb|piso|p\.?\s?\d|dto|dpto|depto|timbre|esq(?:uina)?|entre)\b`, "iu"),
  ],
  // Precio sin signo: "a 600", "sale 1500", "por 2500".
  ["price", /\b(?:a|por|sale|salen|cuesta|cuestan|vale|valen|son)\s+\d{3,}\b(?!\s?%)/i],
  ["alias", /\b[a-z]+\.[a-z]+\.[a-z]+\b/i],
];

export function findLeak(example: Example): string | null {
  const all = [example.context, ...example.reply].join("\n");
  for (const [name, re] of LEAKS) if (re.test(all)) return name;
  return null;
}

/**
 * Ejemplos canónicos: los que van fijos en el prompt. Se reparten entre intenciones
 * (round robin) para que haya de todo: saludos, precios, reclamos, cierres…
 */
export function pickCanonical(examples: Example[], max = 24): Set<number> {
  const byIntent = new Map<string, number[]>();
  examples.forEach((e, i) => byIntent.set(e.intent, [...(byIntent.get(e.intent) ?? []), i]));
  const queues = [...byIntent.values()];
  const picked = new Set<number>();
  for (let round = 0; picked.size < max && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] !== undefined && picked.size < max) picked.add(q[round]);
  }
  return picked;
}

/** Saca duplicados exactos (misma respuesta), que aparecen mucho en chats de ventas. */
export function dedupe(examples: Example[]): Example[] {
  const seen = new Set<string>();
  return examples.filter((e) => {
    const key = e.reply.join("\n").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
