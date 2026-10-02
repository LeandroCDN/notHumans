"use client";

import { GenerationError } from "./generate";
import type { NotHuman, Usage } from "./schema";

// Cliente del chat de prueba. El historial vive en el navegador y se manda entero en cada turno.

export type ChatTurn = { from: "client" | "nh"; texts: string[] };

export type ChatReply = {
  messages: string[];
  reasoning?: string;
  usage: Usage;
  model: string;
  modelId: string;
  cost: number;
  ms: number;
};

/**
 * Lo que el server necesita de la persona: perfil y ejemplos fijos (no todos, para no inflar el prompt).
 * Las correcciones van siempre; los canónicos completan hasta 40.
 */
function persona(nh: NotHuman) {
  const corrected = nh.examples.filter((e) => e.corrected).slice(0, 30);
  const fixed = nh.examples.filter((e) => e.canonical && !e.corrected);
  const rest = (fixed.length || corrected.length ? fixed : nh.examples).slice(0, Math.max(0, 40 - corrected.length));
  const examples = [...corrected, ...rest].map(({ intent, context, reply, corrected }) => ({
    intent,
    context,
    reply,
    corrected,
  }));
  return { name: nh.name, owner: nh.owner, business: nh.business, profile: nh.profile, examples };
}

export async function sendChat(nh: NotHuman, turns: ChatTurn[], modelId: string): Promise<ChatReply> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ persona: persona(nh), turns, modelId }),
  }).catch(() => null);
  if (!res) throw new GenerationError("generic", "network");
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data as ChatReply;
  if (data.error === "missing_key" || data.error === "unauthorized") throw new GenerationError(data.error);
  throw new GenerationError("generic", data.detail ?? `HTTP ${res.status}`);
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(3)}`;
}
