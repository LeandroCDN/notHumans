import { z } from "zod";
import { type ChatTurn, llmJson } from "@/lib/llm";
import { costUsd, findModel } from "@/lib/llm/models";
import { BusinessSchema, guarded } from "@/lib/nothuman/api";
import { chatSystemPrompt } from "@/lib/nothuman/prompts";
import { ExampleSchema, ProfileSchema } from "@/lib/nothuman/schema";

export const maxDuration = 120;

const Text = z.string().trim().min(1).max(2000);

const Body = z.object({
  // El navegador ya tiene la persona cargada: la manda en cada request (perfil + ejemplos fijos).
  persona: z.object({
    name: z.string().max(200),
    owner: z.string().min(1).max(120),
    business: BusinessSchema,
    profile: ProfileSchema,
    examples: z.array(ExampleSchema.extend({ corrected: z.boolean().optional() })).max(60),
  }),
  turns: z
    .array(z.object({ from: z.enum(["client", "nh"]), texts: z.array(Text).min(1).max(20) }))
    .min(1)
    .max(100)
    .refine((t) => t[t.length - 1].from === "client", "el último turno tiene que ser del cliente"),
  modelId: z.string().max(40).optional(),
});

const Reply = z.object({ messages: z.array(z.string().trim().min(1)).min(1).max(10) });

/** Un turno del chat de prueba: el historial entero → los mensajes que mandaría el notHuman. */
export async function POST(req: Request) {
  return guarded(req, Body, async ({ persona, turns, modelId }) => {
    const option = findModel(modelId);
    // Las respuestas anteriores van en el mismo JSON que pedimos, así el modelo no se desconcierta
    // y el historial queda idéntico de un request al siguiente (prefijo cacheable).
    const history: ChatTurn[] = turns.slice(0, -1).map((t) =>
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
  });
}
