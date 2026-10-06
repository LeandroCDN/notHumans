import "server-only";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";
import { jobs } from "@/lib/db/jobs";
import { notHumans } from "@/lib/db/nothumans";
import { profiles } from "@/lib/db/profiles";
import { usage } from "@/lib/db/usage";
import { costUsd, findModelByName } from "@/lib/llm/models";
import { type Kind, type Limits, type Me, type PlanId, monthlyLimit, periodEnd, periodStart, toWire } from "@/lib/plans";
import type { Usage } from "@/lib/nothuman/schema";

// El único punto de control del consumo. Cada ruta que llama a la IA pide un `charge` antes: si no hay cupo
// en el plan, no se llama. Después se cierra con lo que costó (`done`) o se devuelve (`refund`) si falló.

/** Qué tope se alcanzó: un tipo de consumo mensual, una cantidad (notHumans, puestos) o una función del plan. */
export type LimitKind = Kind | "nothumans" | "jobs" | "cost" | "shareLinks" | "proModel" | "connections";

export class LimitError extends Error {
  constructor(
    public kind: LimitKind,
    public limit: number | null,
  ) {
    super(`limit:${kind}`);
  }
}

export const limitResponse = (e: LimitError) =>
  NextResponse.json(
    { error: "limit", kind: e.kind, limit: e.limit, resetsAt: periodEnd().getTime() },
    // 402 = "hace falta pagar": cuando haya planes pagos, el navegador ya sabe ofrecer subir de plan.
    { status: 402 },
  );

export type Charge = {
  id: number;
  /** Cierra la reserva con el costo real. `units` reemplaza la cantidad reservada (audio: segundos reales). */
  done(r: { usage?: Usage | null; model?: string; costUsd?: number; units?: number }): Promise<void>;
  refund(): Promise<void>;
};

const finite = (n: number) => (Number.isFinite(n) ? n : null);

/** Reserva cupo para una acción. Tira LimitError si no hay. */
export async function charge(
  user: { id: string; limits: Limits },
  kind: Kind,
  opts: { units?: number; ref?: string; nothumanId?: string } = {},
): Promise<Charge> {
  const limit = monthlyLimit(kind, user.limits);
  const result = await usage().consume({
    userId: user.id,
    kind,
    units: opts.units ?? 1,
    limit: limit === null ? null : finite(limit),
    costCap: finite(user.limits.costCapUsd),
    since: periodStart(),
    ref: opts.ref,
    nothumanId: opts.nothumanId,
  });
  if (result === "limit") throw new LimitError(kind, limit === null ? null : finite(limit));
  if (result === "cost") throw new LimitError("cost", null);
  const id = result;
  return {
    id,
    async done({ usage: u, model, costUsd: cost, units }) {
      const tokensIn = u?.input ?? 0;
      const tokensOut = u?.output ?? 0;
      const c = cost ?? (u ? costUsd(u, findModelByName(model)) : 0);
      // Si falla el registro no le rompemos la respuesta a la persona: ya la pagamos.
      await usage()
        .finish(id, { costUsd: c, tokensIn, tokensOut, units })
        .catch((err) => console.error("usage finish", err));
    },
    async refund() {
      await usage()
        .refund(id)
        .catch((err) => console.error("usage refund", err));
    },
  };
}

/** Corre `fn` con cupo reservado: si falla, se devuelve; si sale bien, queda registrado lo que costó. */
export async function metered<T extends { usage?: Usage | null; model?: string }>(
  user: { id: string; limits: Limits },
  kind: Kind,
  fn: () => Promise<T>,
  opts: { ref?: string; nothumanId?: string } = {},
): Promise<T> {
  const c = await charge(user, kind, opts);
  try {
    const result = await fn();
    await c.done({ usage: result.usage, model: result.model });
    return result;
  } catch (err) {
    await c.refund();
    throw err;
  }
}

/** Funciones del plan que son sí/no. */
export function requireFeature(user: SessionUser, feature: "shareLinks" | "proModel" | "connections") {
  if (!user.limits[feature]) throw new LimitError(feature, null);
}

/** Topes de cantidad: cuántos notHumans o puestos puede tener a la vez. */
export function requireRoom(user: SessionUser, what: "nothumans" | "jobs", current: number) {
  const max = user.limits[what];
  if (current >= max) throw new LimitError(what, finite(max));
}

// --- La cuenta como la ve el navegador -----------------------------------------------------------------

const minutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;

/** /api/me: quién sos, tu plan y cuánto usaste este mes. */
export async function describe(user: SessionUser, extra: { canLinkGoogle: boolean }): Promise<Me> {
  const [consumed, nothumans, jobCount] = await Promise.all([
    usage().since(periodStart(), user.id),
    notHumans().count(user.id),
    jobs().count(user.id),
  ]);
  const c = consumed.get(user.id) ?? { units: {}, costUsd: 0 };
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    plan: user.planId,
    planExpired: user.planExpired,
    planUntil: user.planUntil,
    admin: user.admin,
    hasGoogle: user.hasGoogle,
    legacy: user.legacyLogin !== null,
    canLinkGoogle: extra.canLinkGoogle && !user.hasGoogle,
    accessRequestedAt: user.accessRequestedAt,
    limits: toWire(user.limits),
    used: {
      generations: c.units.generation ?? 0,
      replies: c.units.reply ?? 0,
      audioMinutes: minutes(c.units.audio ?? 0),
      structures: c.units.structure ?? 0,
      nothumans,
      jobs: jobCount,
    },
    ...(user.admin ? { costUsd: c.costUsd } : {}),
    resetsAt: periodEnd().getTime(),
  };
}

export type AdminUser = {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  avatarUrl: string | null;
  plan: PlanId;
  planUntil: number | null;
  hasGoogle: boolean;
  legacy: boolean;
  accessRequestedAt: number | null;
  createdAt: number;
  nothumans: number;
  jobs: number;
  used: { generations: number; replies: number; audioMinutes: number };
  costUsd: number;
};

/** Panel de admin: todas las cuentas con su consumo del mes. */
export async function listAccounts(): Promise<AdminUser[]> {
  const [all, consumed, nhCounts, jobCounts] = await Promise.all([
    profiles().list(),
    usage().since(periodStart()),
    notHumans().countByUser(),
    jobs().countByUser(),
  ]);
  return all.map((p) => {
    const c = consumed.get(p.id) ?? { units: {}, costUsd: 0 };
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      handle: p.handle,
      avatarUrl: p.avatarUrl,
      plan: p.plan,
      planUntil: p.planUntil,
      hasGoogle: p.hasGoogle,
      legacy: p.legacyLogin !== null,
      accessRequestedAt: p.accessRequestedAt,
      createdAt: p.createdAt,
      nothumans: nhCounts.get(p.id) ?? 0,
      jobs: jobCounts.get(p.id) ?? 0,
      used: {
        generations: c.units.generation ?? 0,
        replies: c.units.reply ?? 0,
        audioMinutes: minutes(c.units.audio ?? 0),
      },
      costUsd: c.costUsd,
    };
  });
}
