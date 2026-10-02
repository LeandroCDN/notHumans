import { z } from "zod";
import { findModel } from "@/lib/llm/models";
import { BusinessSchema, guarded } from "@/lib/nothuman/api";
import { TurnsSchema, replyAs } from "@/lib/nothuman/reply";
import { ExampleSchema, ProfileSchema } from "@/lib/nothuman/schema";

export const maxDuration = 120;

const Body = z.object({
  // El navegador ya tiene la persona cargada: la manda en cada request (perfil + ejemplos fijos).
  persona: z.object({
    name: z.string().max(200),
    owner: z.string().min(1).max(120),
    business: BusinessSchema,
    profile: ProfileSchema,
    examples: z.array(ExampleSchema.extend({ corrected: z.boolean().optional() })).max(60),
  }),
  turns: TurnsSchema,
  modelId: z.string().max(40).optional(),
});

/** Un turno del chat de prueba: el historial entero → los mensajes que mandaría el notHuman. */
export async function POST(req: Request) {
  return guarded(req, Body, ({ persona, turns, modelId }) => replyAs(persona, turns, findModel(modelId)));
}
