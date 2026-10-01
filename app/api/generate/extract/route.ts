import { z } from "zod";
import { llmJson } from "@/lib/llm";
import { BaseRequest, guarded } from "@/lib/nothuman/api";
import { findLeak } from "@/lib/nothuman/pipeline";
import { extractSystemPrompt } from "@/lib/nothuman/prompts";
import { type Example, ExampleSchema, ExtractResultSchema } from "@/lib/nothuman/schema";

export const maxDuration = 120;

const Body = BaseRequest.extend({ block: z.string().min(1).max(12_000) });

/** Un bloque de conversaciones → ejemplos con marcadores + notas de estilo. */
export async function POST(req: Request) {
  return guarded(req, Body, async ({ owner, business, uiLang, block }) => {
    const { data, usage, model } = await llmJson({
      task: "extract",
      system: extractSystemPrompt(owner, business, uiLang),
      user: block,
      schema: ExtractResultSchema,
    });

    const examples: Example[] = [];
    const leaks: string[] = [];
    for (const raw of data.examples) {
      const parsed = ExampleSchema.safeParse(raw);
      if (!parsed.success) continue;
      // Si se escapó un precio, un link o un teléfono, el ejemplo no entra: la persona tiene que ser reutilizable.
      const leak = findLeak(parsed.data);
      if (leak) leaks.push(leak);
      else examples.push(parsed.data);
    }
    return { examples, styleNotes: data.styleNotes, dropped: leaks.length, leaks, usage, model };
  });
}
