import { type ModelOption, costUsd, findModel, sttCostUsd } from "./llm/models";
import { type Limits, PLANS, type PlanId } from "./plans";

// Precios al costo + 5 %. En este período no buscamos ganar plata: cada plan cuesta lo que nos cuesta
// sostener una cuenta que usa TODO su cupo del mes, más la comisión del cobro y un 5 % de margen.
// Todo sale de los precios de `lib/llm/models.ts` y de los topes de `lib/plans.ts`: si cambia uno, cambia
// el precio. Lo usa la página de planes (navegador), así que no importa nada server-only.

/** Cuántos tokens gasta cada cosa, en promedio (medido a ojo con el test drive y la generación). */
export const ASSUMPTIONS = {
  /** Una respuesta: prompt de la persona + puesto + historial (casi todo de caché) y la respuesta corta. */
  reply: { input: 6500, cacheHit: 5200, output: 150 },
  /** Una generación: hasta 12 bloques de 9.000 caracteres (extracción) + el perfil. Sin caché. */
  generation: { input: 55_000, cacheHit: 0, output: 20_000 },
  /** "Contame el laburo": la IA ordena el puesto. */
  structure: { input: 2000, cacheHit: 0, output: 1500 },
  /** Notas de voz de ~15 s (Groq cobra mínimo 10 s por audio). */
  voiceNoteSeconds: 15,
  /** En Business se puede elegir V4 Pro: suponemos que 1 de cada 4 respuestas va con ese modelo. */
  proModelShare: 0.25,
  /** Vercel Pro (US$ 20) + Supabase Pro (US$ 25) por mes. */
  infraUsd: 45,
  /** La infra se reparte entre una base supuesta de cuentas pagas; Business pesa el doble (WhatsApp). */
  accounts: { pro: 25, business: 10 },
  infraWeight: { pro: 1, business: 2 },
  /** Comisión del cobro (Mercado Pago, acreditación inmediata, con IVA). */
  paymentFee: 0.076,
  margin: 0.05,
  /** El precio se redondea para arriba a 10 centavos. */
  roundTo: 0.1,
};

const FLASH = findModel("flash");
const PRO = findModel("pro");

const tokens = (t: { input: number; cacheHit: number; output: number }, m: ModelOption) => costUsd(t, m);

/** Lo que cuesta cada unidad, en USD. */
export function unitCosts() {
  const a = ASSUMPTIONS;
  return {
    replyFlash: tokens(a.reply, FLASH),
    replyPro: tokens(a.reply, PRO),
    generation: tokens(a.generation, FLASH),
    structure: tokens(a.structure, FLASH),
    audioMinute: (60 / a.voiceNoteSeconds) * sttCostUsd(a.voiceNoteSeconds),
  };
}

export type CostLine = { key: "generations" | "replies" | "audio" | "structures"; units: number; usd: number };

/** Cuánto gasta en IA una cuenta que usa todo el cupo del mes. */
export function aiCost(l: Limits): { lines: CostLine[]; total: number } {
  const u = unitCosts();
  const share = l.proModel ? ASSUMPTIONS.proModelShare : 0;
  const reply = u.replyFlash * (1 - share) + u.replyPro * share;
  const lines: CostLine[] = [
    { key: "generations", units: l.generations, usd: l.generations * u.generation },
    { key: "replies", units: l.replies, usd: l.replies * reply },
    { key: "audio", units: l.audioMinutes, usd: l.audioMinutes * u.audioMinute },
    { key: "structures", units: l.structures, usd: l.structures * u.structure },
  ];
  return { lines, total: lines.reduce((s, x) => s + x.usd, 0) };
}

/** La parte de la infra (servidores + base) que le toca a una cuenta de ese plan. */
export function infraShare(plan: "pro" | "business"): number {
  const { infraUsd, accounts, infraWeight } = ASSUMPTIONS;
  const units = accounts.pro * infraWeight.pro + accounts.business * infraWeight.business;
  return (infraUsd / units) * infraWeight[plan];
}

/** Redondea para arriba al múltiplo de `step` (y a centavos, para no arrastrar decimales de punto flotante). */
const up = (v: number, step: number) => Math.round(Math.ceil(Math.round((v / step) * 1e6) / 1e6) * step * 100) / 100;

export type Quote = {
  plan: "free" | "pro" | "business";
  price: number;
  /** El modelo de uso completo, línea por línea. */
  lines: CostLine[];
  /** Lo que cubre el precio: el tope de gasto en IA del plan (nunca se puede gastar más), la infra, la
   *  comisión y el margen. Suman `price` (el redondeo va al margen). */
  ai: number;
  infra: number;
  fee: number;
  margin: number;
};

/** El precio de un plan. La IA que cubre es el tope de seguridad (`costCapUsd`), no el promedio: así,
 *  aunque alguien use todo con el modelo caro, el plan no da pérdida (el tope corta antes). */
export function quote(plan: "free" | "pro" | "business"): Quote {
  const l = PLANS[plan];
  const { lines } = aiCost(l);
  if (plan === "free") return { plan, price: 0, lines, ai: 0, infra: 0, fee: 0, margin: 0 };
  const ai = l.costCapUsd;
  const infra = infraShare(plan);
  const cost = (ai + infra) / (1 - ASSUMPTIONS.paymentFee);
  const price = up(cost * (1 + ASSUMPTIONS.margin), ASSUMPTIONS.roundTo);
  const fee = price * ASSUMPTIONS.paymentFee;
  return { plan, price, lines, ai, infra, fee, margin: price - ai - infra - fee };
}

export const PRICED_PLANS = ["free", "pro", "business"] as const satisfies readonly PlanId[];
