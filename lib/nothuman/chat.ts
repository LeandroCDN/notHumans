"use client";

import type { JobContent } from "@/lib/job/schema";
import { limitFrom, refreshMe } from "@/lib/me";
import { GenerationError } from "./generate";
import { chatPersona } from "./persona";
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
  /** Con puesto: qué partes del puesto usó. */
  used?: string[];
};

export async function sendChat(
  nh: NotHuman,
  turns: ChatTurn[],
  modelId: string,
  job?: { id?: string; name: string; content: JobContent } | null,
): Promise<ChatReply> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ persona: chatPersona(nh), turns, modelId, job }),
  }).catch(() => null);
  if (!res) throw new GenerationError("generic", "network");
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    refreshMe();
    return data as ChatReply;
  }
  if (data.error === "missing_key" || data.error === "unauthorized") throw new GenerationError(data.error);
  const limit = limitFrom(data);
  if (limit) throw new GenerationError("limit", limit.kind);
  throw new GenerationError("generic", data.detail ?? `HTTP ${res.status}`);
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(3)}`;
}
