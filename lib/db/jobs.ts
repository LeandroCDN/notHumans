import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Job, type JobContent, JobContentSchema } from "@/lib/job/schema";
import { supabase } from "./nothumans";

// Puestos de trabajo (tablas jobs + job_versions, vista jobs_current). Igual que los notHumans: cada cambio es
// una versión nueva y el guardado es optimista (si otro guardó mientras tanto, no se pisa).

export type JobRepo = {
  list(): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  create(name: string, content: JobContent, by: string): Promise<Job>;
  /** Guarda una versión nueva si la vigente sigue siendo `base`. null = otro la cambió mientras tanto. */
  save(id: string, base: number, name: string, content: JobContent, by: string): Promise<Job | null>;
  remove(id: string): Promise<void>;
};

type Row = { id: string; name: string; created_at: string; version: number; content: unknown };
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
    async list() {
      const { data, error } = await db.from("jobs_current").select("*").order("created_at", { ascending: false });
      if (error) throw fail("list", error);
      return (data as Row[]).map(fromRow);
    },
    async get(id) {
      const { data, error } = await db.from("jobs_current").select("*").eq("id", id).maybeSingle();
      if (error) throw fail("get", error);
      return data ? fromRow(data as Row) : null;
    },
    async create(name, content, by) {
      const id = randomUUID();
      const { error } = await db.from("jobs").insert({ id, name, created_by: by, current_version: 1 });
      if (error) throw fail("create", error);
      const { error: vError } = await db
        .from("job_versions")
        .insert({ job_id: id, version: 1, name, content, created_by: by });
      if (vError) {
        await db.from("jobs").delete().eq("id", id);
        throw fail("create version", vError);
      }
      return (await repo.get(id))!;
    },
    async save(id, base, name, content, by) {
      const version = base + 1;
      const { error } = await db.from("job_versions").insert({ job_id: id, version, name, content, created_by: by });
      if (error?.code === "23505") return null;
      if (error) throw fail("save", error);
      const { data, error: uError } = await db
        .from("jobs")
        .update({ current_version: version, name, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("current_version", base)
        .select("id");
      if (uError || !data?.length) {
        await db.from("job_versions").delete().eq("job_id", id).eq("version", version);
        if (uError) throw fail("save", uError);
        return null;
      }
      return repo.get(id);
    },
    async remove(id) {
      const { error } = await db.from("jobs").delete().eq("id", id);
      if (error) throw fail("delete", error);
    },
  };
  return repo;
}

function memoryJobs(): JobRepo {
  const g = globalThis as unknown as { __nhJobs?: Map<string, Job> };
  const items = (g.__nhJobs ??= new Map<string, Job>());
  return {
    async list() {
      return [...items.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id) {
      return items.get(id) ?? null;
    },
    async create(name, content) {
      const job: Job = { id: randomUUID(), name, createdAt: Date.now(), version: 1, content };
      items.set(job.id, job);
      return job;
    },
    async save(id, base, name, content) {
      const j = items.get(id);
      if (!j || j.version !== base) return null;
      const next = { ...j, name, content, version: base + 1 };
      items.set(id, next);
      return next;
    },
    async remove(id) {
      items.delete(id);
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
