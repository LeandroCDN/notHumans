import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConversations } from "@/lib/whatsapp/analyze";
import { parseExport } from "@/lib/whatsapp/parse";
import { SAMPLE_SETS } from "@/lib/whatsapp/sample";
import { BLOCK_CHARS, MAX_BLOCKS, buildBlocks, dedupe, findLeak, pickCanonical } from "./pipeline";
import { ExampleSchema, ProfileSchema } from "./schema";

const martina = SAMPLE_SETS.find((s) => s.id === "martina")!;
const chats = martina.files.map((f) =>
  parseExport(readFileSync(join(__dirname, "../../public/samples/martina", f), "utf8"), f),
);
const conversations = buildConversations(chats, "Martina");

describe("buildBlocks", () => {
  it("arma bloques con turnos marcados como CLIENT / OWNER", () => {
    const { blocks, used } = buildBlocks(conversations);
    expect(used).toBe(conversations.length);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]).toMatch(/^=== Conversation 1 · client: /);
    expect(blocks.join("\n")).toContain("OWNER: holaaa sofi 🙌");
    expect(blocks.join("\n")).toContain("(media)");
    expect(blocks.every((b) => b.length <= BLOCK_CHARS)).toBe(true);
  });

  it("con muchísimas conversaciones toma una muestra y no pasa del máximo de bloques", () => {
    const many = Array.from({ length: 60 }, () => conversations).flat();
    const { blocks, used } = buildBlocks(many);
    expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(used).toBeLessThan(many.length);
  });
});

describe("findLeak", () => {
  const ex = (reply: string) => ({ intent: "price" as const, context: "cuánto sale?", reply: [reply] });
  it.each([
    ["sale $48.000 😉", "price"],
    ["son 48.000", "amount"],
    ["te hago 10% off", "percent"],
    ["https://mpago.la/2xK9ab7", "link"],
    ["alias martina.ropa.mp", "alias"],
    ["seguimiento CA123456789AR", "tracking"],
    ["llamalo al 11 2233-4455", "phone"],
  ])("detecta %s", (reply, kind) => expect(findLeak(ex(reply))).toBe(kind));

  it("deja pasar ejemplos con marcadores", () => {
    expect(findLeak(ex("sale {price} y con transfe {discount} off 😉"))).toBeNull();
    expect(findLeak(ex("tenés 30 días para cambiarlo, llega en 48/72hs"))).toBeNull();
  });
});

describe("pickCanonical / dedupe", () => {
  it("reparte entre intenciones", () => {
    const examples = [
      ...Array.from({ length: 10 }, (_, i) => ({ intent: "price" as const, context: "x", reply: [`p${i}`] })),
      { intent: "complaint" as const, context: "x", reply: ["perdón"] },
      { intent: "greeting" as const, context: "x", reply: ["holaa"] },
    ];
    const picked = pickCanonical(examples, 4);
    expect(picked.size).toBe(4);
    expect(picked.has(10)).toBe(true);
    expect(picked.has(11)).toBe(true);
  });

  it("saca respuestas repetidas", () => {
    const e = { intent: "other" as const, context: "a", reply: ["Dale."] };
    expect(dedupe([e, { ...e, context: "b" }, { ...e, reply: ["Ok."] }])).toHaveLength(2);
  });
});

describe("schemas tolerantes", () => {
  it("un intent inventado cae en 'other'", () => {
    expect(ExampleSchema.parse({ intent: "weird", context: "a", reply: ["b"] }).intent).toBe("other");
  });

  it("el perfil completa lo que falta con defaults", () => {
    const p = ProfileSchema.parse({ summary: "s", language: "es", messageStyle: { length: "gigante" } });
    expect(p.messageStyle.length).toBe("short");
    expect(p.greetings).toEqual([]);
  });
});
