import "server-only";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { NotHuman } from "@/lib/nothuman/schema";
import { type VersionInfo, decodeNote } from "@/lib/nothuman/versions";

// Dónde se guardan los notHumans. En producción: Supabase, con la secret key (solo server; las tablas
// tienen RLS sin políticas, así que nadie más puede leerlas). Para desarrollar sin Supabase hay una
// versión en memoria que se pierde al reiniciar el server.

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el servidor");
  }
}

/** Quién hace el cambio: el dueño (id del perfil) y el nombre que queda en el historial de versiones. */
export type Owner = { id: string; name: string };

// Todo lo que lee o cambia un notHuman lleva el id del dueño: una cuenta nunca ve ni toca lo de otra.
export type NotHumanRepo = {
  list(userId: string): Promise<NotHuman[]>;
  get(id: string, userId: string): Promise<NotHuman | null>;
  /** Sin filtrar por dueño: solo para lo que arma el server solo (el link público). Dice de quién es. */
  getAny(id: string): Promise<{ nh: NotHuman; userId: string | null } | null>;
  count(userId: string): Promise<number>;
  /** Para el panel de admin: cuántos tiene cada cuenta. */
  countByUser(): Promise<Map<string, number>>;
  /** Crea el notHuman con su primera versión. Devuelve false si ese id ya existía. */
  create(nh: NotHuman, owner: Owner): Promise<boolean>;
  remove(id: string, userId: string): Promise<void>;
  /** Le asigna un puesto al notHuman (o ninguno). Devuelve false si el notHuman no existe (o no es suyo). */
  setJob(id: string, userId: string, jobId: string | null): Promise<boolean>;
  versions(id: string, userId: string): Promise<VersionInfo[]>;
  getVersion(id: string, userId: string, version: number): Promise<NotHuman | null>;
  /**
   * Guarda `nh` como versión nueva (nh.version) y la deja vigente, solo si la vigente sigue siendo `base`.
   * Devuelve false si otro la cambió mientras tanto (o si no es suyo).
   */
  saveVersion(nh: NotHuman, base: number, note: string, owner: Owner): Promise<boolean>;
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
  job_id?: string | null;
  user_id?: string | null;
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
  jobId: r.job_id ?? null,
});

export function tally(ids: (string | null)[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const id of ids) if (id) map.set(id, (map.get(id) ?? 0) + 1);
  return map;
}

function supabaseRepo(db: SupabaseClient): NotHumanRepo {
  const fail = (what: string, error: { message: string }) => new Error(`Supabase (${what}): ${error.message}`);
  const owns = async (id: string, userId: string) => {
    const { count, error } = await db
      .from("nothumans")
      .select("id", { count: "exact", head: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw fail("owns", error);
    return (count ?? 0) > 0;
  };
  return {
    async list(userId) {
      const { data, error } = await db
        .from("nothumans_current")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw fail("list", error);
      return (data as Row[]).map(fromRow);
    },
    async get(id, userId) {
      const { data, error } = await db.from("nothumans_current").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw fail("get", error);
      return data ? fromRow(data as Row) : null;
    },
    async getAny(id) {
      const { data, error } = await db.from("nothumans_current").select("*").eq("id", id).maybeSingle();
      if (error) throw fail("get", error);
      return data ? { nh: fromRow(data as Row), userId: (data as Row).user_id ?? null } : null;
    },
    async count(userId) {
      const { count, error } = await db.from("nothumans").select("id", { count: "exact", head: true }).eq("user_id", userId);
      if (error) throw fail("count", error);
      return count ?? 0;
    },
    async countByUser() {
      const { data, error } = await db.from("nothumans").select("user_id");
      if (error) throw fail("count by user", error);
      return tally((data as { user_id: string | null }[]).map((r) => r.user_id));
    },
    async create(nh, owner) {
      const { error } = await db.from("nothumans").insert({
        id: nh.id,
        name: nh.name,
        owner: nh.owner,
        created_by: owner.name,
        user_id: owner.id,
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
        created_by: owner.name,
      });
      if (vError) {
        // Sin transacción desde la API: si falla la versión, no dejamos un notHuman vacío.
        await db.from("nothumans").delete().eq("id", nh.id);
        throw fail("create version", vError);
      }
      return true;
    },
    async remove(id, userId) {
      const { error } = await db.from("nothumans").delete().eq("id", id).eq("user_id", userId);
      if (error) throw fail("delete", error);
    },
    async setJob(id, userId, jobId) {
      const { data, error } = await db
        .from("nothumans")
        .update({ job_id: jobId })
        .eq("id", id)
        .eq("user_id", userId)
        .select("id");
      if (error) throw fail("set job", error);
      return !!data?.length;
    },
    async versions(id, userId) {
      if (!(await owns(id, userId))) return [];
      const { data, error } = await db
        .from("nothuman_versions")
        .select("version, note, created_at, created_by, example_count")
        .eq("nothuman_id", id)
        .order("version", { ascending: false });
      if (error) throw fail("versions", error);
      return (data as { version: number; note: string; created_at: string; created_by: string; example_count: number }[]).map(
        (v) => ({
          version: v.version,
          note: decodeNote(v.note),
          createdAt: Date.parse(v.created_at),
          createdBy: v.created_by,
          examples: v.example_count,
        }),
      );
    },
    async getVersion(id, userId, version) {
      const [parent, row] = await Promise.all([
        db.from("nothumans").select("id, name, owner, created_at").eq("id", id).eq("user_id", userId).maybeSingle(),
        db
          .from("nothuman_versions")
          .select("version, business, profile, examples, stats")
          .eq("nothuman_id", id)
          .eq("version", version)
          .maybeSingle(),
      ]);
      if (parent.error) throw fail("get version", parent.error);
      if (row.error) throw fail("get version", row.error);
      if (!parent.data || !row.data) return null;
      return fromRow({ ...parent.data, ...row.data } as Row);
    },
    async saveVersion(nh, base, note, owner) {
      if (!(await owns(nh.id, owner.id))) return false;
      const { error } = await db.from("nothuman_versions").insert({
        nothuman_id: nh.id,
        version: nh.version,
        business: nh.business,
        profile: nh.profile,
        examples: nh.examples,
        stats: nh.stats,
        note,
        created_by: owner.name,
      });
      if (error?.code === "23505") return false; // otro ya guardó esa versión
      if (error) throw fail("save version", error);
      // Solo si nadie movió la versión vigente mientras tanto.
      const { data, error: uError } = await db
        .from("nothumans")
        .update({ current_version: nh.version, updated_at: new Date().toISOString() })
        .eq("id", nh.id)
        .eq("user_id", owner.id)
        .eq("current_version", base)
        .select("id");
      if (uError || !data?.length) {
        await db.from("nothuman_versions").delete().eq("nothuman_id", nh.id).eq("version", nh.version);
        if (uError) throw fail("save version", uError);
        return false;
      }
      return true;
    },
  };
}

type MemoryEntry = {
  userId: string;
  current: number;
  jobId?: string | null;
  versions: { nh: NotHuman; note: string; by: string; at: number }[];
};

function memoryRepo(): NotHumanRepo {
  const g = globalThis as unknown as { __nhMemory?: Map<string, MemoryEntry> };
  const items = (g.__nhMemory ??= new Map<string, MemoryEntry>());
  const current = (e: MemoryEntry) => ({ ...e.versions.find((v) => v.nh.version === e.current)!.nh, jobId: e.jobId ?? null });
  const mine = (id: string, userId: string) => {
    const e = items.get(id);
    return e && e.userId === userId ? e : undefined;
  };
  return {
    async list(userId) {
      return [...items.values()]
        .filter((e) => e.userId === userId)
        .map(current)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id, userId) {
      const e = mine(id, userId);
      return e ? current(e) : null;
    },
    async getAny(id) {
      const e = items.get(id);
      return e ? { nh: current(e), userId: e.userId } : null;
    },
    async count(userId) {
      return [...items.values()].filter((e) => e.userId === userId).length;
    },
    async countByUser() {
      return tally([...items.values()].map((e) => e.userId));
    },
    async create(nh, owner) {
      if (items.has(nh.id)) return false;
      items.set(nh.id, { userId: owner.id, current: nh.version, versions: [{ nh, note: "generated", by: owner.name, at: Date.now() }] });
      return true;
    },
    async remove(id, userId) {
      if (mine(id, userId)) items.delete(id);
    },
    async setJob(id, userId, jobId) {
      const e = mine(id, userId);
      if (!e) return false;
      e.jobId = jobId;
      return true;
    },
    async versions(id, userId) {
      return (mine(id, userId)?.versions ?? [])
        .map((v) => ({
          version: v.nh.version,
          note: decodeNote(v.note),
          createdAt: v.at,
          createdBy: v.by,
          examples: v.nh.examples.length,
        }))
        .sort((a, b) => b.version - a.version);
    },
    async getVersion(id, userId, version) {
      return mine(id, userId)?.versions.find((v) => v.nh.version === version)?.nh ?? null;
    },
    async saveVersion(nh, base, note, owner) {
      const e = mine(nh.id, owner.id);
      if (!e || e.current !== base || e.versions.some((v) => v.nh.version === nh.version)) return false;
      e.versions.push({ nh, note, by: owner.name, at: Date.now() });
      e.current = nh.version;
      return true;
    },
  };
}

/** Cliente de Supabase con la secret key, o null si no está configurado (desarrollo en memoria). */
let client: SupabaseClient | null | undefined;
export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } else if (process.env.NODE_ENV !== "production" || process.env.LLM_MOCK === "1") {
    console.warn("notHumans: sin Supabase configurado, se guarda en memoria");
    client = null;
  } else {
    throw new StorageNotConfiguredError();
  }
  return client;
}

let repo: NotHumanRepo | null = null;

export function notHumans(): NotHumanRepo {
  if (repo) return repo;
  const db = supabase();
  repo = db ? supabaseRepo(db) : memoryRepo();
  return repo;
}
