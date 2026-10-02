import { describe, expect, it } from "vitest";
import { MODELS, costUsd, findModel } from "@/lib/llm/models";
import { chatSystemPrompt } from "./prompts";
import { NotHumanSchema, ProfileSchema } from "./schema";

const profile = ProfileSchema.parse({
  summary: "Escribe corto y cercano.",
  language: "Español rioplatense (voseo)",
  tone: ["cercano"],
  messageStyle: { length: "short", splitsMessages: true },
  emojis: { frequency: "medium", favorites: ["🙌"] },
  greetings: ["holaa"],
  catchphrases: ["te la separo?"],
});

const persona = {
  name: "Martina",
  owner: "Martina",
  business: { name: "Martina", whatTheySell: "ropa", where: "", audience: "", roles: [], notes: "" },
  profile,
  examples: [{ intent: "price" as const, context: "cuánto sale?\nla negra", reply: ["sale {price}", "te la separo?"] }],
};

describe("chatSystemPrompt", () => {
  it("lleva el perfil, los ejemplos en el mismo JSON que se pide y la regla de marcadores", () => {
    const p = chatSystemPrompt(persona);
    expect(p).toContain('You are Martina, the person behind "Martina"');
    expect(p).toContain('- Greetings: "holaa"');
    expect(p).toContain("several short messages in a row");
    expect(p).toContain('CLIENT: cuánto sale? / la negra\nYOU: {"messages":["sale {price}","te la separo?"]}');
    expect(p).toContain("{shipping_time}");
    expect(p).toContain('{"messages": [');
  });

  it("es determinístico, para que el proveedor lo cachee entre mensajes", () => {
    expect(chatSystemPrompt(persona)).toBe(chatSystemPrompt(structuredClone(persona)));
  });
});

describe("modelos y costo", () => {
  it("cae al modelo por defecto si el id no existe", () => {
    expect(findModel("no-existe").id).toBe("flash");
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });

  it("cobra la caché más barata que la entrada nueva", () => {
    const flash = findModel("flash");
    const sinCache = costUsd({ input: 10_000, cacheHit: 0, output: 100 }, flash);
    const conCache = costUsd({ input: 10_000, cacheHit: 9_000, output: 100 }, flash);
    expect(conCache).toBeLessThan(sinCache);
    expect(sinCache).toBeCloseTo((10_000 * 0.3 + 100 * 1.2) / 1_000_000);
  });
});

describe("NotHumanSchema", () => {
  const nh = {
    id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
    name: "Martina",
    owner: "Martina",
    createdAt: 1_790_000_000_000,
    version: 1,
    business: persona.business,
    profile,
    examples: persona.examples.map((e) => ({ ...e, canonical: true })),
    stats: { conversations: 6, examplesFound: 1, examplesDropped: 0, usage: { input: 1, cacheHit: 0, output: 1 }, model: "x" },
  };

  it("acepta un notHuman como el que se descarga en JSON", () => {
    expect(NotHumanSchema.safeParse(JSON.parse(JSON.stringify(nh))).success).toBe(true);
  });

  it("rechaza un JSON que no es un notHuman", () => {
    expect(NotHumanSchema.safeParse({ ...nh, id: "1" }).success).toBe(false);
    expect(NotHumanSchema.safeParse({ hola: "mundo" }).success).toBe(false);
  });
});
