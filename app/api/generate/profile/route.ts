import { z } from "zod";
import { llmJson } from "@/lib/llm";
import { BaseRequest, guarded } from "@/lib/nothuman/api";
import { profileSystemPrompt } from "@/lib/nothuman/prompts";
import { ExampleSchema, ProfileSchema } from "@/lib/nothuman/schema";

export const maxDuration = 120;

const Body = BaseRequest.extend({
  styleNotes: z.array(z.string().max(600)).max(120),
  examples: z.array(ExampleSchema).max(40),
});

/** Todas las notas de estilo + una muestra de ejemplos → el perfil de personalidad. */
export async function POST(req: Request) {
  return guarded(req, Body, async ({ owner, business, uiLang, styleNotes, examples }) => {
    const user =
      `STYLE NOTES (${styleNotes.length}):\n` +
      styleNotes.map((n) => `- ${n}`).join("\n") +
      `\n\nREAL REPLY EXAMPLES (${examples.length}):\n` +
      examples.map((e) => `[${e.intent}] CLIENT: ${e.context}\nOWNER: ${e.reply.join(" | ")}`).join("\n\n");

    const { data, usage, model } = await llmJson({
      task: "profile",
      system: profileSystemPrompt(owner, business, uiLang),
      user,
      schema: ProfileSchema,
      maxTokens: 3000,
    });
    return { profile: data, usage, model };
  });
}
