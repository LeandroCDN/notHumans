import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Job, type JobContent, JobContentSchema } from "@/lib/job/schema";
import { type Owner, supabase, tally } from "./nothumans";

// Puestos de trabajo (tablas jobs + job_versions, vista jobs_current). Igual que los notHumans: cada cambio es
// una versión nueva y el guardado es optimista (si otro guardó mientras tanto, no se pisa).

// Igual que los notHumans: todo lleva el id del dueño, una cuenta no ve los puestos de otra.
export type JobRepo = {
  list(userId: string): Promise<Job[]>;
  get(id: string, userId: string): Promise<Job | null>;
  /** Sin filtrar por dueño: solo para el link público (el puesto del notHuman, que sale de la base). */
  getAny(id: string): Promise<Job | null>;
  count(userId: string): Promise<number>;
  countByUser(): Promise<Map<string, number>>;
  create(name: string, content: JobContent, owner: Owner): Promise<Job>;
  /** Guarda una versión nueva si la vigente sigue siendo `base`. null = otro la cambió mientras tanto. */
  save(id: string, base: number, name: string, content: JobContent, owner: Owner): Promise<Job | null>;
  remove(id: string, userId: string): Promise<void>;
};

type Row = { id: string; name: string; created_at: string; version: number; content: unknown; user_id?: string | null };
// El contenido pasa por el esquema al leerlo: si cambia la forma, lo viejo sigue andando.
const fromRow = (r: Row): Job => ({
  id: r.id,
  name: r.name,
  createdAt: Date.parse(r.created_at),
  version: r.version,
  content: JobContentSchema.parse(r.content),
});

function supabaseJobs(db: SupabaseClient): JobRepo {
  const fail = (what: string, error: { message: string }) => new Error(`Supabase (jobs ${what}): ${error.message}`);
  const repo: JobRepo = {
    async list(userId) {
      const { data, error } = await db
        .from("jobs_current")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw fail("list", error);
      return (data as Row[]).map(fromRow);
    },
    async get(id, userId) {
      const { data, error } = await db.from("jobs_current").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw fail("get", error);
      return data ? fromRow(data as Row) : null;
    },
    async getAny(id) {
      const { data, error } = await db.from("jobs_current").select("*").eq("id", id).maybeSingle();
      if (error) throw fail("get", error);
      return data ? fromRow(data as Row) : null;
    },
    async count(userId) {
      const { count, error } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId);
      if (error) throw fail("count", error);
      return count ?? 0;
    },
    async countByUser() {
      const { data, error } = await db.from("jobs").select("user_id");
      if (error) throw fail("count by user", error);
      return tally((data as { user_id: string | null }[]).map((r) => r.user_id));
    },
    async create(name, content, owner) {
      const id = randomUUID();
      const { error } = await db.from("jobs").insert({ id, name, created_by: owner.name, user_id: owner.id, current_version: 1 });
      if (error) throw fail("create", error);
      const { error: vError } = await db
        .from("job_versions")
        .insert({ job_id: id, version: 1, name, content, created_by: owner.name });
      if (vError) {
        await db.from("jobs").delete().eq("id", id);
        throw fail("create version", vError);
      }
      return (await repo.get(id, owner.id))!;
    },
    async save(id, base, name, content, owner) {
      if (!(await repo.get(id, owner.id))) return null;
      const version = base + 1;
      const { error } = await db.from("job_versions").insert({ job_id: id, version, name, content, created_by: owner.name });
      if (error?.code === "23505") return null;
      if (error) throw fail("save", error);
      const { data, error: uError } = await db
        .from("jobs")
        .update({ current_version: version, name, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", owner.id)
        .eq("current_version", base)
        .select("id");
      if (uError || !data?.length) {
        await db.from("job_versions").delete().eq("job_id", id).eq("version", version);
        if (uError) throw fail("save", uError);
        return null;
      }
      return repo.get(id, owner.id);
    },
    async remove(id, userId) {
      const { error } = await db.from("jobs").delete().eq("id", id).eq("user_id", userId);
      if (error) throw fail("delete", error);
    },
  };
  return repo;
}

function memoryJobs(): JobRepo {
  const g = globalThis as unknown as { __nhJobs?: Map<string, { job: Job; userId: string }> };
  const items = (g.__nhJobs ??= new Map<string, { job: Job; userId: string }>());
  const mine = (id: string, userId: string) => {
    const e = items.get(id);
    return e && e.userId === userId ? e : undefined;
  };
  return {
    async list(userId) {
      return [...items.values()]
        .filter((e) => e.userId === userId)
        .map((e) => e.job)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id, userId) {
      return mine(id, userId)?.job ?? null;
    },
    async getAny(id) {
      return items.get(id)?.job ?? null;
    },
    async count(userId) {
      return [...items.values()].filter((e) => e.userId === userId).length;
    },
    async countByUser() {
      return tally([...items.values()].map((e) => e.userId));
    },
    async create(name, content, owner) {
      const job: Job = { id: randomUUID(), name, createdAt: Date.now(), version: 1, content };
      items.set(job.id, { job, userId: owner.id });
      return job;
    },
    async save(id, base, name, content, owner) {
      const e = mine(id, owner.id);
      if (!e || e.job.version !== base) return null;
      e.job = { ...e.job, name, content, version: base + 1 };
      return e.job;
    },
    async remove(id, userId) {
      if (mine(id, userId)) items.delete(id);
    },
  };
}

let repo: JobRepo | null = null;
export function jobs(): JobRepo {
  if (repo) return repo;
  const db = supabase();
  repo = db ? supabaseJobs(db) : memoryJobs();
  return repo;
}
