import { z } from "zod";

// Los planes de cuenta. Viven en código (tipados y con tests): cambiar un número es un deploy.
// La cuenta es abierta; lo que se controla es el acceso al modelo, y eso lo define el plan.
// Por ahora el plan lo asigna un admin a mano; el día que haya cobros, el pago solo cambia `plan`.
// Se usa en el server (topes) y en el navegador (medidores), así que no importa nada server-only.

export const PLAN_IDS = ["free", "pro", "business", "admin"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Limits = {
  /** notHumans que puede tener a la vez. */
  nothumans: number;
  /** Puestos que puede tener a la vez. */
  jobs: number;
  /** Generaciones de notHumans por mes. */
  generations: number;
  /** Respuestas por mes (test drive + links públicos de sus notHumans). */
  replies: number;
  /** Minutos de audio transcripto por mes. */
  audioMinutes: number;
  /** Veces por mes que la IA ordena un puesto ("Contame el laburo"). */
  structures: number;
  shareLinks: boolean;
  publish: boolean;
  /** Puede elegir V4 Pro en el chat de prueba. */
  proModel: boolean;
  /** Conexiones externas (Sheets, WhatsApp…). */
  connections: boolean;
  /** Comunidad: respuestas para probar cada notHuman público ajeno, y tope por día. */
  communityRepliesPerNotHuman: number;
  communityRepliesPerDay: number;
  /** Red de seguridad, oculta: si en el mes gastó esto en IA, se corta todo hasta el mes que viene. */
  costCapUsd: number;
};

const ALL = Infinity;

export const PLANS: Record<PlanId, Limits> = {
  free: {
    nothumans: 0,
    jobs: 0,
    generations: 0,
    replies: 0,
    audioMinutes: 0,
    structures: 0,
    shareLinks: false,
    publish: false,
    proModel: false,
    connections: false,
    communityRepliesPerNotHuman: 3,
    communityRepliesPerDay: 30,
    costCapUsd: 0.25,
  },
  pro: {
    nothumans: 3,
    jobs: 1,
    generations: 5,
    replies: 2000,
    audioMinutes: 60,
    structures: 30,
    shareLinks: true,
    publish: true,
    proModel: false,
    connections: false,
    communityRepliesPerNotHuman: ALL,
    communityRepliesPerDay: ALL,
    costCapUsd: 5,
  },
  business: {
    nothumans: 15,
    jobs: 10,
    generations: 30,
    replies: 20_000,
    audioMinutes: 600,
    structures: 200,
    shareLinks: true,
    publish: true,
    proModel: true,
    connections: true,
    communityRepliesPerNotHuman: ALL,
    communityRepliesPerDay: ALL,
    costCapUsd: 40,
  },
  admin: {
    nothumans: ALL,
    jobs: ALL,
    generations: ALL,
    replies: ALL,
    audioMinutes: ALL,
    structures: ALL,
    shareLinks: true,
    publish: true,
    proModel: true,
    connections: true,
    communityRepliesPerNotHuman: ALL,
    communityRepliesPerDay: ALL,
    costCapUsd: ALL,
  },
};

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);

// Overrides: lo que venga de la base pasa por acá; lo que no tenga forma válida se ignora.
const num = z.number().min(0).optional().catch(undefined);
const bool = z.boolean().optional().catch(undefined);
const OverridesSchema = z
  .object({
    nothumans: num,
    jobs: num,
    generations: num,
    replies: num,
    audioMinutes: num,
    structures: num,
    shareLinks: bool,
    publish: bool,
    proModel: bool,
    connections: bool,
    communityRepliesPerNotHuman: num,
    communityRepliesPerDay: num,
    costCapUsd: num,
  })
  .catch({});

export type Overrides = Partial<Limits>;

export function parseOverrides(raw: unknown): Overrides {
  const parsed = OverridesSchema.parse(raw ?? {});
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) as Overrides;
}

/** El plan que rige ahora: si venció, la cuenta se comporta como Free (sin perder nada de lo que tiene). */
export function effectivePlan(p: { plan: PlanId; planUntil: number | null; overrides?: Overrides }, now = Date.now()) {
  const expired = p.planUntil !== null && p.planUntil <= now && p.plan !== "free";
  const id: PlanId = expired ? "free" : p.plan;
  return { id, expired, limits: { ...PLANS[id], ...(expired ? {} : p.overrides) } as Limits };
}

// --- Consumo ----------------------------------------------------------------------------------------

/** Lo que se registra en `usage`. Los cuatro primeros tienen tope mensual; extract/profile son los pasos
 *  de una generación y solo cuentan para el tope de costo. */
export const KINDS = ["generation", "reply", "audio", "structure", "extract", "profile"] as const;
export type Kind = (typeof KINDS)[number];

/** El tope mensual de cada tipo, en las unidades que se guardan (audio: segundos). null = sin tope propio. */
export function monthlyLimit(kind: Kind, l: Limits): number | null {
  switch (kind) {
    case "generation":
      return l.generations;
    case "reply":
      return l.replies;
    case "audio":
      return l.audioMinutes * 60;
    case "structure":
      return l.structures;
    default:
      return null;
  }
}

/** El consumo se cuenta por mes calendario (UTC). Cuando haya cobros, pasa a contarse desde la fecha de pago. */
export function periodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function periodEnd(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Para mandar al navegador: JSON no tiene Infinity, así que "sin tope" viaja como null. */
export type WireLimits = { [K in keyof Limits]: Limits[K] extends number ? number | null : Limits[K] };

export function toWire(l: Limits): WireLimits {
  return Object.fromEntries(
    Object.entries(l).map(([k, v]) => [k, typeof v === "number" && !Number.isFinite(v) ? null : v]),
  ) as WireLimits;
}

/** Lo que devuelve /api/me: la cuenta, su plan y cuánto consumió en el mes. */
export type Me = {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  avatarUrl: string | null;
  plan: PlanId;
  planExpired: boolean;
  planUntil: number | null;
  admin: boolean;
  hasGoogle: boolean;
  /** Entró con usuario y contraseña (cuenta fija): puede vincular Google. */
  legacy: boolean;
  canLinkGoogle: boolean;
  accessRequestedAt: number | null;
  limits: WireLimits;
  used: { generations: number; replies: number; audioMinutes: number; structures: number; nothumans: number; jobs: number };
  /** Solo para admin: cuánto costó en dólares. */
  costUsd?: number;
  resetsAt: number;
};
