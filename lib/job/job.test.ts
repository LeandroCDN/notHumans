import { describe, expect, it } from "vitest";
import { chatSystemPrompt } from "@/lib/nothuman/prompts";
import { ProfileSchema } from "@/lib/nothuman/schema";
import { isOpen, jobManual, nowNote, scheduleSummary } from "./manual";
import { DEFAULT_DAYS, JobContentSchema, emptyJobContent } from "./schema";

const content = JobContentSchema.parse({
  lang: "es",
  brief: "ferretería",
  business: { what: "Ferretería de barrio en Lanús", sells: "materiales", audience: "", where: "Lanús Oeste" },
  rules: [
    { kind: "never", text: "Descuentos por WhatsApp" },
    { kind: "always", text: "Cambios hasta 30 días con ticket" },
  ],
  schedule: {
    tz: "America/Argentina/Buenos_Aires",
    days: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ open: i < 6, from: "08:00", to: i === 5 ? "13:00" : "18:00" })),
    offHours: "avisá que se prepara mañana",
  },
  handoff: { triggers: ["reclamos", "factura A"], message: "dejame que lo consulto" },
});

describe("esquema del puesto", () => {
  it("es tolerante con lo que venga raro del modelo", () => {
    const c = JobContentSchema.parse({
      rules: [{ kind: "rarísimo", text: "algo" }, { kind: "never", text: "" }, "basura"],
      schedule: { days: [{ open: true }] },
    });
    expect(c.rules).toEqual([{ kind: "info", text: "algo" }]);
    expect(c.schedule.days).toEqual(DEFAULT_DAYS);
    expect(c.business.what).toBe("");
    expect(c.lang).toBe("es");
  });
});

describe("manual del empleado", () => {
  it("junta los días seguidos con el mismo horario", () => {
    expect(scheduleSummary(content.schedule.days, "es")).toBe(
      "Lunes a viernes 08:00–18:00 · Sábado 08:00–13:00 · Domingo cerrado",
    );
    expect(scheduleSummary(DEFAULT_DAYS, "en")).toBe("Monday to Friday 09:00–18:00 · Saturday to Sunday closed");
  });

  it("lleva el negocio, las reglas, el horario y cuándo pasar a una persona", () => {
    const m = jobManual("Ferretería El Tano", content);
    expect(m).toContain("## Tu puesto: Ferretería El Tano");
    expect(m).toContain("- Qué es: Ferretería de barrio en Lanús");
    expect(m).not.toContain("A quién le vende");
    expect(m).toContain("- NUNCA: Descuentos por WhatsApp");
    expect(m).toContain("Fuera de horario: avisá que se prepara mañana");
    expect(m).toContain("Pasá la charla a una persona si: reclamos; factura A.");
  });

  it("sabe si el negocio está abierto, en su zona horaria", () => {
    // Martes 6 de octubre de 2026, 15:00 en Buenos Aires (UTC-3) = 18:00 UTC.
    expect(isOpen(content, new Date("2026-10-06T18:00:00Z"))).toBe(true);
    // Martes 22:00 en Buenos Aires.
    expect(isOpen(content, new Date("2026-10-07T01:00:00Z"))).toBe(false);
    // Domingo.
    expect(isOpen(content, new Date("2026-10-04T15:00:00Z"))).toBe(false);
    expect(nowNote(content, new Date("2026-10-06T18:00:00Z"))).toContain("martes 15:00; el negocio está abierto");
  });
});

describe("prompt del chat con puesto", () => {
  const persona = {
    name: "Martina",
    owner: "Martina",
    business: { name: "Martina", whatTheySell: "ropa", where: "", audience: "", roles: [], notes: "" },
    profile: ProfileSchema.parse({ summary: "s", language: "es" }),
    examples: [{ intent: "price" as const, context: "precio?", reply: ["sale {price}"] }],
  };

  it("con puesto: el manual reemplaza el negocio de los chats y pide 'used'", () => {
    const p = chatSystemPrompt(persona, { name: "Ferretería El Tano", content });
    expect(p).toContain('working at "Ferretería El Tano"');
    expect(p).toContain("## Tu puesto: Ferretería El Tano");
    expect(p).not.toContain("What they sell: ropa");
    expect(p).toContain("override your style and your examples");
    expect(p).toContain('"used"');
  });

  it("sin puesto queda como antes", () => {
    const p = chatSystemPrompt(persona);
    expect(p).not.toContain("Tu puesto");
    expect(p).not.toContain('"used"');
    expect(p).toContain("You don't know the business facts");
  });

  it("un puesto vacío igual arma un manual válido", () => {
    expect(jobManual("X", emptyJobContent("en"))).toContain("## Your job: X");
  });
});
