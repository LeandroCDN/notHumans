import { z } from "zod";
import { metered, requireFeature } from "@/lib/account";
import { findModel } from "@/lib/llm/models";
import { BusinessSchema, guarded } from "@/lib/nothuman/api";
import { TurnsSchema, replyAs } from "@/lib/nothuman/reply";
import { jobs } from "@/lib/db/jobs";
import { JobContentSchema, JobNameSchema } from "@/lib/job/schema";
import { stockForReply } from "@/lib/stock/service";
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
  /** El puesto asignado, si tiene (el navegador ya lo tiene cargado). */
  job: z.object({ id: z.uuid().optional(), name: JobNameSchema, content: JobContentSchema }).nullish(),
});

/** Un turno del chat de prueba: el historial entero → los mensajes que mandaría el notHuman. */
export async function POST(req: Request) {
  return guarded(req, Body, async ({ persona, turns, modelId, job }, user) => {
    const option = findModel(modelId);
    if (option.model !== findModel(undefined).model) requireFeature(user, "proModel");
    // El stock sale de la base (no del navegador), y solo si el puesto es de esta cuenta.
    const stock = job?.id && (await jobs().get(job.id, user.id)) ? await stockForReply(job.id, user.id) : null;
    // Cada respuesta descuenta una del plan del dueño de la cuenta.
    return metered(user, "reply", () => replyAs(persona, turns, option, job && { ...job, stock }));
  });
}
