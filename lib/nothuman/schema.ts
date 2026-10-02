import { z } from "zod";

// Formas de lo que devuelve el modelo y de lo que guardamos. Son tolerantes a propósito:
// si el modelo se inventa un valor raro en un enum, cae al default en vez de romper todo.

export const INTENTS = [
  "greeting",
  "product_question",
  "price",
  "availability",
  "shipping",
  "payment",
  "order",
  "complaint",
  "returns",
  "follow_up",
  "small_talk",
  "closing",
  "other",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Datos del negocio que se reemplazan por marcadores para que la persona sea reutilizable. */
export const PLACEHOLDERS = [
  "product",
  "price",
  "discount",
  "stock",
  "size",
  "color",
  "shipping_cost",
  "shipping_time",
  "shipping_company",
  "payment_method",
  "payment_alias",
  "payment_link",
  "schedule",
  "address",
  "link",
  "tracking_code",
  "customer_name",
  "phone",
  "email",
  "date",
] as const;

const text = z.string().trim();
const list = z.array(text).catch([]).default([]);

export const ExampleSchema = z.object({
  intent: z.enum(INTENTS).catch("other"),
  context: text.min(1),
  reply: z.array(text.min(1)).min(1),
});
export type Example = z.infer<typeof ExampleSchema>;

export const ExtractResultSchema = z.object({
  examples: z.array(z.unknown()).default([]),
  styleNotes: list,
});

export const ProfileSchema = z.object({
  summary: text,
  language: text,
  tone: list,
  register: text.catch(""),
  messageStyle: z
    .object({
      length: z.enum(["very_short", "short", "medium", "long"]).catch("short"),
      splitsMessages: z.boolean().catch(false),
      capitalization: text.catch(""),
      punctuation: text.catch(""),
    })
    .catch({ length: "short", splitsMessages: false, capitalization: "", punctuation: "" }),
  emojis: z
    .object({
      frequency: z.enum(["none", "low", "medium", "high"]).catch("low"),
      favorites: list,
    })
    .catch({ frequency: "low", favorites: [] }),
  greetings: list,
  signOffs: list,
  catchphrases: list,
  sales: text.catch(""),
  complaints: text.catch(""),
  doNots: list,
});
export type Profile = z.infer<typeof ProfileSchema>;

export type Usage = { input: number; cacheHit: number; output: number };

export const BusinessSchema = z.object({
  name: z.string().max(200).default(""),
  whatTheySell: z.string().max(500).default(""),
  where: z.string().max(300).default(""),
  audience: z.string().max(100).default(""),
  roles: z.array(z.string().max(100)).max(10).default([]),
  notes: z.string().max(2000).default(""),
});
export type BusinessInput = z.infer<typeof BusinessSchema>;

/** Un ejemplo guardado. `corrected`: lo escribió una persona corrigiendo al notHuman desde el chat. */
export type StoredExample = Example & { canonical: boolean; corrected?: boolean };

export type NotHuman = {
  id: string;
  name: string;
  owner: string;
  createdAt: number;
  version: number;
  business: BusinessInput;
  profile: Profile;
  examples: StoredExample[];
  stats: {
    conversations: number;
    examplesFound: number;
    examplesDropped: number;
    usage: Usage;
    model: string;
  };
  /** Puesto asignado (no es parte de la personalidad: cambiarlo no crea una versión nueva). */
  jobId?: string | null;
};

const UsageSchema = z.object({ input: z.number(), cacheHit: z.number(), output: z.number() });

/** Un notHuman completo, como llega del navegador para guardarlo (o de un JSON descargado). */
export const NotHumanSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  owner: z.string().trim().min(1).max(120),
  createdAt: z.number(),
  version: z.number().int().min(1),
  business: BusinessSchema,
  profile: ProfileSchema,
  examples: z.array(ExampleSchema.extend({ canonical: z.boolean(), corrected: z.boolean().optional() })).max(2000),
  stats: z.object({
    conversations: z.number(),
    examplesFound: z.number(),
    examplesDropped: z.number(),
    usage: UsageSchema,
    model: z.string(),
  }),
});
