import "server-only";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { NotHuman } from "@/lib/nothuman/schema";

// Dónde se guardan los notHumans. En producción: Supabase, con la secret key (solo server; las tablas
// tienen RLS sin políticas, así que nadie más puede leerlas). Para desarrollar sin Supabase hay una
// versión en memoria que se pierde al reiniciar el server.

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el servidor");
  }
}

export type NotHumanRepo = {
  list(): Promise<NotHuman[]>;
  get(id: string): Promise<NotHuman | null>;
  /** Crea el notHuman con su primera versión. Devuelve false si ese id ya existía. */
  create(nh: NotHuman, by: string): Promise<boolean>;
  remove(id: string): Promise<void>;
};

type Row = {
  id: string;
  name: string;
  owner: string;
  created_at: string;
  version: number;
  business: NotHuman["business"];
  profile: NotHuman["profile"];
  examples: NotHuman["examples"];
  stats: NotHuman["stats"];
};

const fromRow = (r: Row): NotHuman => ({
  id: r.id,
  name: r.name,
  owner: r.owner,
  createdAt: Date.parse(r.created_at),
  version: r.version,
  business: r.business,
  profile: r.profile,
  examples: r.examples,
  stats: r.stats,
});

function supabaseRepo(db: SupabaseClient): NotHumanRepo {
  const fail = (what: string, error: { message: string }) => new Error(`Supabase (${what}): ${error.message}`);
  return {
    async list() {
      const { data, error } = await db.from("nothumans_current").select("*").order("created_at", { ascending: false });
      if (error) throw fail("list", error);
      return (data as Row[]).map(fromRow);
    },
    async get(id) {
      const { data, error } = await db.from("nothumans_current").select("*").eq("id", id).maybeSingle();
      if (error) throw fail("get", error);
      return data ? fromRow(data as Row) : null;
    },
    async create(nh, by) {
      const { error } = await db.from("nothumans").insert({
        id: nh.id,
        name: nh.name,
        owner: nh.owner,
        created_by: by,
        current_version: nh.version,
        created_at: new Date(nh.createdAt).toISOString(),
      });
      if (error?.code === "23505") return false; // ya existe (por ejemplo, un import repetido)
      if (error) throw fail("create", error);
      const { error: vError } = await db.from("nothuman_versions").insert({
        nothuman_id: nh.id,
        version: nh.version,
        business: nh.business,
        profile: nh.profile,
        examples: nh.examples,
        stats: nh.stats,
        note: "generated",
        created_by: by,
      });
      if (vError) {
        // Sin transacción desde la API: si falla la versión, no dejamos un notHuman vacío.
        await db.from("nothumans").delete().eq("id", nh.id);
        throw fail("create version", vError);
      }
      return true;
    },
    async remove(id) {
      const { error } = await db.from("nothumans").delete().eq("id", id);
      if (error) throw fail("delete", error);
    },
  };
}

function memoryRepo(): NotHumanRepo {
  const g = globalThis as unknown as { __nhMemory?: Map<string, NotHuman> };
  const items = (g.__nhMemory ??= new Map());
  return {
    async list() {
      return [...items.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id) {
      return items.get(id) ?? null;
    },
    async create(nh) {
      if (items.has(nh.id)) return false;
      items.set(nh.id, nh);
      return true;
    },
    async remove(id) {
      items.delete(id);
    },
  };
}

let repo: NotHumanRepo | null = null;

export function notHumans(): NotHumanRepo {
  if (repo) return repo;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    repo = supabaseRepo(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else if (process.env.NODE_ENV !== "production" || process.env.LLM_MOCK === "1") {
    console.warn("notHumans: sin Supabase configurado, se guardan en memoria");
    repo = memoryRepo();
  } else {
    throw new StorageNotConfiguredError();
  }
  return repo;
}
