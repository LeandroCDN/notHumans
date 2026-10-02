import "server-only";
import { z } from "zod";
import { type ChatTurn as LlmTurn, llmJson } from "@/lib/llm";
import { type ModelOption, costUsd } from "@/lib/llm/models";
import { type ChatPersona, chatSystemPrompt } from "./prompts";

// Una respuesta del notHuman a una conversación. La usan el test drive y el link público.

export type Turn = { from: "client" | "nh"; texts: string[] };

const Text = z.string().trim().min(1).max(2000);
export const TurnsSchema = z
  .array(z.object({ from: z.enum(["client", "nh"]), texts: z.array(Text).min(1).max(20) }))
  .min(1)
  .max(100)
  .refine((t) => t[t.length - 1].from === "client", "el último turno tiene que ser del cliente");

const Reply = z.object({ messages: z.array(z.string().trim().min(1)).min(1).max(10) });

export async function replyAs(persona: ChatPersona, turns: Turn[], option: ModelOption) {
  // Las respuestas anteriores van en el mismo JSON que pedimos, así el modelo no se desconcierta
  // y el historial queda idéntico de un request al siguiente (prefijo cacheable).
  const history: LlmTurn[] = turns.slice(0, -1).map((t) =>
    t.from === "client"
      ? { role: "user", content: t.texts.join("\n") }
      : { role: "assistant", content: JSON.stringify({ messages: t.texts }) },
  );
  const started = Date.now();
  const { data, usage, model, reasoning } = await llmJson({
    task: "chat",
    system: chatSystemPrompt(persona),
    history,
    user: turns[turns.length - 1].texts.join("\n"),
    schema: Reply,
    model: option,
    maxTokens: 1000,
    temperature: 0.8,
  });
  return {
    messages: data.messages,
    reasoning,
    usage,
    model,
    modelId: option.id,
    cost: costUsd(usage, option),
    ms: Date.now() - started,
  };
}
