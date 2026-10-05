import { z } from "zod";
import { metered } from "@/lib/account";
import { llmJson } from "@/lib/llm";
import { BaseRequest, RequestError, guarded } from "@/lib/nothuman/api";
import { profileSystemPrompt } from "@/lib/nothuman/prompts";
import { readTicket } from "@/lib/nothuman/ticket";
import { ExampleSchema, ProfileSchema } from "@/lib/nothuman/schema";

export const maxDuration = 120;

const Body = BaseRequest.extend({
  styleNotes: z.array(z.string().max(600)).max(120),
  examples: z.array(ExampleSchema).max(40),
});

/** Todas las notas de estilo + una muestra de ejemplos → el perfil de personalidad. */
export async function POST(req: Request) {
  return guarded(req, Body, async ({ owner, business, uiLang, styleNotes, examples, ticket }, user) => {
    const gen = await readTicket(ticket, user.id);
    if (gen === null) throw new RequestError("expired", 409);
    const prompt =
      `STYLE NOTES (${styleNotes.length}):\n` +
      styleNotes.map((n) => `- ${n}`).join("\n") +
      `\n\nREAL REPLY EXAMPLES (${examples.length}):\n` +
      examples.map((e) => `[${e.intent}] CLIENT: ${e.context}\nOWNER: ${e.reply.join(" | ")}`).join("\n\n");

    const { data, usage, model } = await metered(
      user,
      "profile",
      () =>
        llmJson({
          task: "profile",
          system: profileSystemPrompt(owner, business, uiLang),
          user: prompt,
          schema: ProfileSchema,
          maxTokens: 3000,
        }),
      { ref: String(gen) },
    );
    return { profile: data, usage, model };
  });
}
