import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type StockMap,
  StockMapSchema,
  type StockSnapshot,
  type StockSource,
  type StockStatus,
} from "@/lib/stock/types";
import { supabase } from "./nothumans";

// La planilla de stock de cada puesto (tabla stock_sources, una por puesto). `get` no filtra por dueño: las rutas
// lo usan después de comprobar que el puesto es de la cuenta, y el link público / WhatsApp con el puesto de la base.

export type StockRepo = {
  get(jobId: string): Promise<StockSource | null>;
  save(source: StockSource, userId: string): Promise<StockSource>;
  remove(jobId: string, userId: string): Promise<void>;
};

type Row = {
  job_id: string;
  spreadsheet_id: string;
  title: string;
  map: unknown;
  snapshot: unknown;
  status: StockStatus;
  error: string | null;
  synced_at: string | null;
};

const fromRow = (r: Row): StockSource => ({
  jobId: r.job_id,
  spreadsheetId: r.spreadsheet_id,
  title: r.title,
  map: StockMapSchema.parse(r.map) as StockMap,
  snapshot: (r.snapshot as StockSnapshot | null)?.tabs ? (r.snapshot as StockSnapshot) : { tabs: [] },
  status: r.status,
  error: r.error,
  syncedAt: r.synced_at ? Date.parse(r.synced_at) : null,
});

function supabaseStock(db: SupabaseClient): StockRepo {
  const fail = (what: string, error: { message: string }) => new Error(`Supabase (stock ${what}): ${error.message}`);
  return {
    async get(jobId) {
      const { data, error } = await db.from("stock_sources").select("*").eq("job_id", jobId).maybeSingle();
      if (error) throw fail("get", error);
      return data ? fromRow(data as Row) : null;
    },
    async save(s, userId) {
      const { data, error } = await db
        .from("stock_sources")
        .upsert({
          job_id: s.jobId,
          user_id: userId,
          spreadsheet_id: s.spreadsheetId,
          title: s.title,
          map: s.map,
          snapshot: s.snapshot,
          status: s.status,
          error: s.error,
          synced_at: s.syncedAt ? new Date(s.syncedAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw fail("save", error);
      return fromRow(data as Row);
    },
    async remove(jobId, userId) {
      const { error } = await db.from("stock_sources").delete().eq("job_id", jobId).eq("user_id", userId);
      if (error) throw fail("delete", error);
    },
  };
}

function memoryStock(): StockRepo {
  const g = globalThis as unknown as { __nhStock?: Map<string, { source: StockSource; userId: string }> };
  const items = (g.__nhStock ??= new Map());
  return {
    async get(jobId) {
      return items.get(jobId)?.source ?? null;
    },
    async save(source, userId) {
      items.set(source.jobId, { source, userId });
      return source;
    },
    async remove(jobId, userId) {
      if (items.get(jobId)?.userId === userId) items.delete(jobId);
    },
  };
}

let repo: StockRepo | null = null;
export function stock(): StockRepo {
  if (repo) return repo;
  const db = supabase();
  repo = db ? supabaseStock(db) : memoryStock();
  return repo;
}
