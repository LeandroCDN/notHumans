import { z } from "zod";
import { metered } from "@/lib/account";
import { llmJson } from "@/lib/llm";
import { JobContentSchema } from "@/lib/job/schema";
import { guarded } from "@/lib/nothuman/api";
import { jobStructurePrompt } from "@/lib/nothuman/prompts";

export const maxDuration = 60;

const Body = z.object({ brief: z.string().trim().min(10).max(6000), uiLang: z.enum(["en", "es"]).default("es") });

// Lo que devuelve el modelo: el contenido del puesto (sin idioma ni brief, que los ponemos nosotros) + un nombre.
const Structured = JobContentSchema.omit({ lang: true, brief: true }).extend({
  name: z.string().trim().max(120).catch("").default(""),
});

/** "Contame el laburo" → el puesto ordenado en secciones (negocio, reglas, horario, pasar a una persona). */
export async function POST(req: Request) {
  return guarded(req, Body, async ({ brief, uiLang }, user) => {
    const { data, usage, model } = await metered(user, "structure", () =>
      llmJson({
        task: "job",
        system: jobStructurePrompt(uiLang),
        user: brief,
        schema: Structured,
        maxTokens: 3000,
        temperature: 0.2,
      }),
    );
    const { name, ...rest } = data;
    return { name, content: JobContentSchema.parse({ ...rest, lang: uiLang, brief }), usage, model };
  });
}
