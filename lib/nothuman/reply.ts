import "server-only";
import { z } from "zod";
import { type ChatTurn as LlmTurn, llmJson } from "@/lib/llm";
import { type ModelOption, costUsd } from "@/lib/llm/models";
import { nowNote } from "@/lib/job/manual";
import { stockPrompt } from "@/lib/stock/map";
import { type ChatJob, type ChatPersona, chatSystemPrompt } from "./prompts";

// Una respuesta del notHuman a una conversación. La usan el test drive y el link público.

export type Turn = { from: "client" | "nh"; texts: string[] };

const Text = z.string().trim().min(1).max(2000);
export const TurnsSchema = z
  .array(z.object({ from: z.enum(["client", "nh"]), texts: z.array(Text).min(1).max(20) }))
  .min(1)
  .max(100)
  .refine((t) => t[t.length - 1].from === "client", "el último turno tiene que ser del cliente");

const Reply = z.object({
  messages: z.array(z.string().trim().min(1)).min(1).max(10),
  /** Con puesto: qué partes del puesto usó (para mostrarlo en el chat de prueba). */
  used: z.array(z.string().trim().min(1).max(80)).max(8).catch([]).default([]),
});

export async function replyAs(persona: ChatPersona, turns: Turn[], option: ModelOption, job?: ChatJob | null) {
  // Las respuestas anteriores van en el mismo JSON que pedimos, así el modelo no se desconcierta
  // y el historial queda idéntico de un request al siguiente (prefijo cacheable).
  const history: LlmTurn[] = turns.slice(0, -1).map((t) =>
    t.from === "client"
      ? { role: "user", content: t.texts.join("\n") }
      : { role: "assistant", content: JSON.stringify({ messages: t.texts }) },
  );
  // Con puesto, la hora del negocio va pegada al último mensaje (no al prompt fijo, que se cachea). Con stock
  // grande, también las filas que coinciden con lo que viene preguntando el cliente (sus últimos mensajes).
  const last = turns[turns.length - 1].texts.join("\n");
  const asked = turns
    .filter((t) => t.from === "client")
    .slice(-3)
    .map((t) => t.texts.join(" "))
    .join(" ");
  const stock = job?.stock ? stockPrompt(job.stock, asked, job.content.lang) : null;
  const notes = job ? [stock?.note, nowNote(job.content, new Date())].filter(Boolean).join("\n") : "";
  const started = Date.now();
  const { data, usage, model, reasoning } = await llmJson({
    task: "chat",
    system: chatSystemPrompt(persona, job, stock?.fixed),
    history,
    user: notes ? `${last}\n\n${notes}` : last,
    schema: Reply,
    model: option,
    maxTokens: 1000,
    temperature: 0.8,
  });
  return {
    messages: data.messages,
    used: job ? data.used : [],
    reasoning,
    usage,
    model,
    modelId: option.id,
    cost: costUsd(usage, option),
    ms: Date.now() - started,
  };
}
