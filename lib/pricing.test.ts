import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";
import { ASSUMPTIONS, aiCost, infraShare, quote } from "./pricing";

describe("precios al costo + 5 %", () => {
  it("el tope de gasto de cada plan cubre usar todo el cupo (y no mucho más)", () => {
    for (const plan of ["pro", "business"] as const) {
      const modeled = aiCost(PLANS[plan]).total;
      expect(PLANS[plan].costCapUsd).toBeGreaterThanOrEqual(modeled);
      expect(PLANS[plan].costCapUsd - modeled).toBeLessThan(0.5);
    }
  });

  it("el precio cubre IA + infra + comisión, con un margen de ~5 %", () => {
    for (const plan of ["pro", "business"] as const) {
      const q = quote(plan);
      expect(q.ai + q.infra + q.fee + q.margin).toBeCloseTo(q.price, 6);
      const cost = q.ai + q.infra;
      expect(q.margin / cost).toBeGreaterThanOrEqual(ASSUMPTIONS.margin - 1e-9);
      // El redondeo a 10 centavos no puede convertir el 5 % en otra cosa.
      expect(q.margin / cost).toBeLessThan(ASSUMPTIONS.margin + 0.04);
      expect(Math.round(q.price * 100)).toBe(q.price * 100);
    }
  });

  it("Free no cuesta nada; Business cuesta más que Pro", () => {
    expect(quote("free").price).toBe(0);
    expect(quote("business").price).toBeGreaterThan(quote("pro").price);
  });

  it("la infra se reparte entera entre la base supuesta de cuentas", () => {
    const { accounts, infraUsd } = ASSUMPTIONS;
    expect(accounts.pro * infraShare("pro") + accounts.business * infraShare("business")).toBeCloseTo(infraUsd, 6);
  });
});
