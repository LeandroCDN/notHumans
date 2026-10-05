import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kind } from "@/lib/plans";
import { supabase } from "./nothumans";

// El registro de consumo (tabla usage). Cada acción que cuesta plata reserva una fila antes de llamar a la IA
// (si no hay cupo, no se llama) y después se completa con el costo real, o se borra si la llamada falló:
// lo que sale mal no se cobra.

export type Consumed = { units: Partial<Record<Kind, number>>; costUsd: number };

export type ConsumeRequest = {
  userId: string;
  kind: Kind;
  units: number;
  /** Tope del mes para este tipo (null = sin tope propio). */
  limit: number | null;
  /** Tope de costo del mes en dólares (null = sin tope). */
  costCap: number | null;
  since: Date;
  ref?: string;
  nothumanId?: string;
};

export type UsageRepo = {
  /** Reserva: el id de la fila, o por qué no se pudo. */
  consume(r: ConsumeRequest): Promise<number | "limit" | "cost">;
  finish(id: number, r: { units?: number; costUsd: number; tokensIn: number; tokensOut: number }): Promise<void>;
  refund(id: number): Promise<void>;
  /** Lo consumido desde `since`, por usuario. */
  since(since: Date, userId?: string): Promise<Map<string, Consumed>>;
  /** Si hay alguna fila de ese tipo colgada de `ref` (por ejemplo, si una generación llegó al perfil). */
  hasRef(ref: string, kind: Kind): Promise<boolean>;
  /** La fila reservada de una generación, para validar que el ticket sigue vivo. */
  exists(id: number, userId: string, kind: Kind): Promise<boolean>;
};

const add = (map: Map<string, Consumed>, userId: string, kind: Kind, units: number, cost: number) => {
  const c = map.get(userId) ?? { units: {}, costUsd: 0 };
  c.units[kind] = (c.units[kind] ?? 0) + units;
  c.costUsd += cost;
  map.set(userId, c);
};

function supabaseUsage(db: SupabaseClient): UsageRepo {
  const fail = (what: string, error: { message: string }) => new Error(`Supabase (usage ${what}): ${error.message}`);
  return {
    async consume(r) {
      const { data, error } = await db.rpc("consume_usage", {
        p_user: r.userId,
        p_kind: r.kind,
        p_units: r.units,
        p_limit: r.limit,
        p_cost_cap: r.costCap,
        p_since: r.since.toISOString(),
        p_ref: r.ref ?? null,
        p_nothuman: r.nothumanId ?? null,
      });
      if (error) throw fail("consume", error);
      const id = Number(data);
      return id === -1 ? "limit" : id === -2 ? "cost" : id;
    },
    async finish(id, r) {
      const { error } = await db
        .from("usage")
        .update({
          cost_usd: r.costUsd,
          tokens_in: r.tokensIn,
          tokens_out: r.tokensOut,
          ...(r.units !== undefined ? { units: r.units } : {}),
        })
        .eq("id", id);
      if (error) throw fail("finish", error);
    },
    async refund(id) {
      const { error } = await db.from("usage").delete().eq("id", id);
      if (error) throw fail("refund", error);
    },
    async since(since, userId) {
      const { data, error } = await db.rpc("usage_since", { p_since: since.toISOString(), p_user: userId ?? null });
      if (error) throw fail("since", error);
      const map = new Map<string, Consumed>();
      for (const r of data as { user_id: string; kind: Kind; units: number | string; cost_usd: number | string }[]) {
        add(map, r.user_id, r.kind, Number(r.units), Number(r.cost_usd));
      }
      return map;
    },
    async hasRef(ref, kind) {
      const { count, error } = await db
        .from("usage")
        .select("id", { count: "exact", head: true })
        .eq("ref", ref)
        .eq("kind", kind);
      if (error) throw fail("has ref", error);
      return (count ?? 0) > 0;
    },
    async exists(id, userId, kind) {
      const { count, error } = await db
        .from("usage")
        .select("id", { count: "exact", head: true })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("kind", kind);
      if (error) throw fail("exists", error);
      return (count ?? 0) > 0;
    },
  };
}

type Row = { id: number; userId: string; kind: Kind; units: number; costUsd: number; ref?: string; at: number };

/** En memoria: JavaScript corre de a un request por vez entre awaits, así que reservar ya es atómico. */
function memoryUsage(): UsageRepo {
  const g = globalThis as unknown as { __nhUsage?: { seq: number; rows: Row[] } };
  const store = (g.__nhUsage ??= { seq: 0, rows: [] });
  return {
    async consume(r) {
      const t = r.since.getTime();
      const mine = store.rows.filter((x) => x.userId === r.userId && x.at >= t);
      if (r.limit !== null) {
        const used = mine.filter((x) => x.kind === r.kind).reduce((n, x) => n + x.units, 0);
        if (used + r.units > r.limit) return "limit";
      }
      if (r.costCap !== null && mine.reduce((n, x) => n + x.costUsd, 0) >= r.costCap) return "cost";
      const row: Row = { id: ++store.seq, userId: r.userId, kind: r.kind, units: r.units, costUsd: 0, ref: r.ref, at: Date.now() };
      store.rows.push(row);
      return row.id;
    },
    async finish(id, r) {
      const row = store.rows.find((x) => x.id === id);
      if (!row) return;
      row.costUsd = r.costUsd;
      if (r.units !== undefined) row.units = r.units;
    },
    async refund(id) {
      store.rows = store.rows.filter((x) => x.id !== id);
    },
    async since(since, userId) {
      const map = new Map<string, Consumed>();
      for (const x of store.rows) {
        if (x.at >= since.getTime() && (!userId || x.userId === userId)) add(map, x.userId, x.kind, x.units, x.costUsd);
      }
      return map;
    },
    async hasRef(ref, kind) {
      return store.rows.some((x) => x.ref === ref && x.kind === kind);
    },
    async exists(id, userId, kind) {
      return store.rows.some((x) => x.id === id && x.userId === userId && x.kind === kind);
    },
  };
}

let repo: UsageRepo | null = null;
export function usage(): UsageRepo {
  if (repo) return repo;
  const db = supabase();
  repo = db ? supabaseUsage(db) : memoryUsage();
  return repo;
}
