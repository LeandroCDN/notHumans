import { z } from "zod";

// Un puesto de trabajo: el negocio donde trabaja un notHuman y sus reglas. Separado de la personalidad.
// Tolerante como el resto de los esquemas: lo que viene raro del modelo cae a un valor razonable.

const text = (max: number) => z.string().trim().max(max).catch("").default("");

export const RULE_KINDS = ["always", "never", "info"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export const RuleSchema = z.object({
  kind: z.enum(RULE_KINDS).catch("info"),
  text: z.string().trim().min(1).max(400),
});
export type Rule = z.infer<typeof RuleSchema>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DaySchema = z.object({
  open: z.boolean().catch(false),
  from: z.string().regex(TIME).catch("09:00"),
  to: z.string().regex(TIME).catch("18:00"),
});
export type Day = z.infer<typeof DaySchema>;

/** Lunes a viernes de 9 a 18; fin de semana cerrado. */
export const DEFAULT_DAYS: Day[] = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ open: i < 5, from: "09:00", to: "18:00" }));

export const JobContentSchema = z.object({
  /** Idioma en que está escrito el puesto (los títulos del manual salen en ese idioma). */
  lang: z.enum(["es", "en"]).catch("es").default("es"),
  /** Lo que contó el dueño en "Contame el laburo", tal cual. */
  brief: text(6000),
  business: z
    .object({ what: text(300), sells: text(300), audience: text(300), where: text(300) })
    .catch({ what: "", sells: "", audience: "", where: "" }),
  rules: z.array(z.unknown()).max(40).catch([]).default([])
    .transform((xs) => xs.flatMap((x) => {
      const r = RuleSchema.safeParse(x);
      return r.success ? [r.data] : [];
    })),
  schedule: z
    .object({
      tz: z.string().max(60).catch("America/Argentina/Buenos_Aires").default("America/Argentina/Buenos_Aires"),
      /** De lunes (0) a domingo (6). */
      days: z.array(DaySchema).length(7).catch(DEFAULT_DAYS),
      offHours: text(400),
    })
    .catch({ tz: "America/Argentina/Buenos_Aires", days: DEFAULT_DAYS, offHours: "" }),
  handoff: z
    .object({ triggers: z.array(z.string().trim().min(1).max(200)).max(15).catch([]), message: text(300) })
    .catch({ triggers: [], message: "" }),
});
export type JobContent = z.infer<typeof JobContentSchema>;

export type Job = { id: string; name: string; createdAt: number; version: number; content: JobContent };

export const JobNameSchema = z.string().trim().min(1).max(120);

export function emptyJobContent(lang: "es" | "en"): JobContent {
  return {
    lang,
    brief: "",
    business: { what: "", sells: "", audience: "", where: "" },
    rules: [],
    schedule: { tz: "America/Argentina/Buenos_Aires", days: DEFAULT_DAYS.map((d) => ({ ...d })), offHours: "" },
    handoff: { triggers: [], message: "" },
  };
}
