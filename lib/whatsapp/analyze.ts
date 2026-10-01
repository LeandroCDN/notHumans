import type { ParsedChat } from "./parse";

export type Role = "owner" | "client";

/** Mensajes seguidos de una misma persona, agrupados. */
export type Turn = { role: Role; author: string; ts: number; texts: string[] };

export type Conversation = {
  id: string;
  fileName: string;
  client: string;
  start: number;
  end: number;
  turns: Turn[];
};

export type OwnerGuess = {
  owner: string | null;
  confident: boolean;
  /** Cómo lo dedujimos: aparece en todos los chats, o el archivo lleva el nombre del otro. */
  reason: "all-files" | "filename" | null;
  candidates: { name: string; files: number; messages: number }[];
};

export const MEDIA_PLACEHOLDER = "📎 multimedia";

/** Chats 1 a 1 reconocidos: los únicos que usamos para armar el perfil. */
export function usableChats(chats: ParsedChat[]): ParsedChat[] {
  return chats.filter((c) => c.format && !c.isGroup && c.participants.length === 2);
}

/**
 * El dueño es quien exportó los chats. Dos pistas:
 * 1. Aparece en todos los chats (cuando hay más de uno).
 * 2. WhatsApp nombra el archivo con el *otro* participante ("Chat de WhatsApp con Caro.txt").
 */
export function detectOwner(chats: ParsedChat[]): OwnerGuess {
  const usable = usableChats(chats);
  const agg = new Map<string, { files: number; messages: number; votes: number }>();
  let hinted = 0;
  for (const chat of usable) {
    for (const p of chat.participants) {
      const a = agg.get(p.name) ?? { files: 0, messages: 0, votes: 0 };
      a.files++;
      a.messages += p.messages;
      agg.set(p.name, a);
    }
    const file = chat.fileName.toLowerCase();
    const named = chat.participants.filter((p) => p.name.length >= 2 && file.includes(p.name.toLowerCase()));
    if (named.length === 1) {
      hinted++;
      agg.get(chat.participants.find((p) => p !== named[0])!.name)!.votes++;
    }
  }
  const all = [...agg].map(([name, a]) => ({ name, ...a }));
  const candidates = all
    .map(({ name, files, messages }) => ({ name, files, messages }))
    .sort((a, b) => b.files - a.files || b.messages - a.messages);
  if (candidates.length === 0) return { owner: null, confident: false, reason: null, candidates };

  const inAll = candidates.filter((c) => c.files === usable.length);
  if (usable.length >= 2 && inAll.length === 1) {
    return { owner: inAll[0].name, confident: true, reason: "all-files", candidates };
  }
  const voted = all.filter((c) => c.votes > 0).sort((a, b) => b.votes - a.votes);
  if (voted.length > 0 && (voted.length === 1 || voted[0].votes > voted[1].votes)) {
    return { owner: voted[0].name, confident: voted[0].votes === hinted, reason: "filename", candidates };
  }
  // Sin pistas: con varios chats arriesgamos; con uno solo, que elija el usuario.
  return { owner: usable.length >= 2 ? candidates[0].name : null, confident: false, reason: null, candidates };
}

const MAX_WAIT_HOURS = 72;

/**
 * Corta cada chat en conversaciones y agrupa los mensajes en turnos.
 * Una pausa larga corta la conversación solo si el dueño tuvo la última palabra:
 * si el cliente quedó esperando, la respuesta de la mañana siguiente sigue siendo parte
 * de la misma charla (salvo que hayan pasado más de 3 días).
 */
export function buildConversations(chats: ParsedChat[], owner: string, gapHours = 6): Conversation[] {
  const gap = gapHours * 3_600_000;
  const maxWait = MAX_WAIT_HOURS * 3_600_000;
  const out: Conversation[] = [];

  for (const chat of usableChats(chats)) {
    if (!chat.participants.some((p) => p.name === owner)) continue;
    const client = chat.participants.find((p) => p.name !== owner)?.name ?? "Cliente";
    let current: Conversation | null = null;

    const flush = () => {
      if (!current) return;
      const roles = new Set(current.turns.map((t) => t.role));
      if (roles.has("owner") && roles.has("client")) out.push(current);
      current = null;
    };

    for (const msg of chat.messages) {
      if (!msg.author || (msg.kind !== "text" && msg.kind !== "media")) continue;
      if (current) {
        const pause = msg.ts - current.end;
        const ownerClosed = current.turns.at(-1)?.role === "owner";
        if (pause > maxWait || (pause > gap && ownerClosed)) flush();
      }
      current ??= {
        id: `${chat.fileName}#${out.length}-${msg.ts}`,
        fileName: chat.fileName,
        client,
        start: msg.ts,
        end: msg.ts,
        turns: [],
      };
      const role: Role = msg.author === owner ? "owner" : "client";
      const text = msg.kind === "media" ? MEDIA_PLACEHOLDER : msg.text;
      const last = current.turns.at(-1);
      if (last && last.role === role) last.texts.push(text);
      else current.turns.push({ role, author: msg.author, ts: msg.ts, texts: [text] });
      current.end = msg.ts;
    }
    flush();
  }
  return out.sort((a, b) => a.start - b.start);
}

export type Summary = {
  conversations: number;
  turns: number;
  /** Turno de cliente seguido de una respuesta del dueño: lo que después será un ejemplo. */
  pairs: number;
  ownerMessages: number;
  clientMessages: number;
  avgWords: number;
  topEmojis: { emoji: string; count: number }[];
  topOpeners: { word: string; count: number }[];
  peakHour: number | null;
  laughRate: number;
  range: { from: number; to: number } | null;
};

const EMOJI = /\p{Extended_Pictographic}/gu;
const LAUGH = /\b(?:ja){2,}|\b(?:je){2,}|\bjsj|\b(?:ha){2,}|\blol\b|😂|🤣/i;

function top<T extends string>(counts: Map<T, number>, n: number) {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Un primer vistazo a cómo habla el dueño, sin IA: puro conteo. */
export function summarize(conversations: Conversation[]): Summary {
  const emojis = new Map<string, number>();
  const openers = new Map<string, number>();
  const hours = new Array<number>(24).fill(0);
  let turns = 0;
  let pairs = 0;
  let ownerMessages = 0;
  let clientMessages = 0;
  let words = 0;
  let laughs = 0;

  for (const conv of conversations) {
    turns += conv.turns.length;
    conv.turns.forEach((turn, i) => {
      const texts = turn.texts.filter((t) => t !== MEDIA_PLACEHOLDER);
      if (turn.role === "client") {
        clientMessages += turn.texts.length;
        if (conv.turns[i + 1]?.role === "owner") pairs++;
        return;
      }
      ownerMessages += turn.texts.length;
      hours[new Date(turn.ts).getHours()]++;
      const opener = texts[0]?.toLowerCase().match(/^[\p{L}]+/u)?.[0];
      if (opener) openers.set(opener, (openers.get(opener) ?? 0) + 1);
      for (const t of texts) {
        words += t.split(/\s+/).filter(Boolean).length;
        if (LAUGH.test(t)) laughs++;
        for (const e of t.match(EMOJI) ?? []) emojis.set(e, (emojis.get(e) ?? 0) + 1);
      }
    });
  }

  const textMessages = Math.max(1, ownerMessages);
  const peak = Math.max(...hours);
  return {
    conversations: conversations.length,
    turns,
    pairs,
    ownerMessages,
    clientMessages,
    avgWords: Math.round((words / textMessages) * 10) / 10,
    topEmojis: top(emojis, 5).map(([emoji, count]) => ({ emoji, count })),
    topOpeners: top(openers, 3).map(([word, count]) => ({ word, count })),
    peakHour: peak > 0 ? hours.indexOf(peak) : null,
    laughRate: Math.round((laughs / textMessages) * 100),
    range: conversations.length
      ? { from: conversations[0].start, to: Math.max(...conversations.map((c) => c.end)) }
      : null,
  };
}
