import { describe, expect, it } from "vitest";
import { chatSystemPrompt } from "./prompts";
import { type NotHuman, ProfileSchema } from "./schema";
import { correctionsLeak, decodeNote, encodeNote, withCorrections } from "./versions";

const nh: NotHuman = {
  id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  name: "Martina",
  owner: "Martina",
  createdAt: 0,
  version: 1,
  business: { name: "Martina", whatTheySell: "", where: "", audience: "", roles: [], notes: "" },
  profile: ProfileSchema.parse({ summary: "s", language: "es" }),
  examples: [
    { intent: "price", context: "cuánto sale?", reply: ["Buenas tardes, el precio es {price}."], canonical: true },
    { intent: "greeting", context: "hola", reply: ["holaa"], canonical: false },
  ],
  stats: { conversations: 1, examplesFound: 2, examplesDropped: 0, usage: { input: 0, cacheHit: 0, output: 0 }, model: "x" },
};

describe("notas de versión", () => {
  it("van y vuelven como código", () => {
    for (const n of [{ kind: "generated" }, { kind: "corrections", count: 3 }, { kind: "restored", from: 1 }] as const) {
      expect(decodeNote(encodeNote(n))).toEqual(n);
    }
    expect(decodeNote("cualquier cosa")).toEqual({ kind: "generated" });
  });
});

describe("withCorrections", () => {
  const fix = { intent: "other" as const, context: "cuánto sale?", reply: ["sale {price}", "te la separo?"] };

  it("pone las correcciones primero, fijas y marcadas, sin perder los ejemplos anteriores", () => {
    const out = withCorrections(nh, [fix]);
    expect(out[0]).toEqual({ ...fix, canonical: true, corrected: true });
    expect(out).toHaveLength(3);
  });

  it("no duplica una corrección idéntica a un ejemplo que ya estaba", () => {
    const same = { intent: "other" as const, context: "hola", reply: ["holaa"] };
    expect(withCorrections(nh, [same])).toHaveLength(2);
  });

  it("rechaza correcciones con datos reales", () => {
    expect(correctionsLeak([fix])).toBeNull();
    expect(correctionsLeak([fix, { ...fix, reply: ["sale $48.000"] }])).toBe("price");
    expect(correctionsLeak([{ ...fix, reply: ["pasá por Rawson 2167"] }])).toBe("address");
  });
});

describe("prompt con correcciones", () => {
  it("las separa en su propia sección, después de los ejemplos", () => {
    const examples = withCorrections(nh, [{ intent: "other", context: "cuánto sale?", reply: ["sale {price}"] }]);
    const p = chatSystemPrompt({ ...nh, examples });
    const fixAt = p.indexOf("Corrections: Martina rewrote");
    expect(fixAt).toBeGreaterThan(p.indexOf("Real examples"));
    expect(p.slice(fixAt)).toContain('YOU: {"messages":["sale {price}"]}');
    // El ejemplo corregido no aparece repetido entre los comunes.
    expect(p.slice(0, fixAt)).not.toContain('{"messages":["sale {price}"]}');
  });

  it("sin correcciones no agrega la sección", () => {
    expect(chatSystemPrompt(nh)).not.toContain("Corrections:");
  });
});
