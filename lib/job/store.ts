"use client";

import { useEffect, useState } from "react";
import { call, forgetJob } from "@/lib/nothuman/store";
import type { Job, JobContent } from "./schema";

// Puestos en el navegador: una caché compartida por todas las pantallas, como la de notHumans.

const EVENT = "nh-jobs-change";
let cache: Job[] | null = null;
let loading: Promise<void> | null = null;
let failed = false;

const emit = () => window.dispatchEvent(new Event(EVENT));

function load(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = call<{ items: Job[] }>("/api/jobs")
    .then((r) => {
      cache = r.items;
      failed = false;
    })
    .catch(() => {
      failed = true;
      cache ??= [];
    })
    .finally(emit);
  return loading;
}

/** Lista reactiva de puestos; `null` mientras carga. */
export function useJobs(): { jobs: Job[] | null; failed: boolean; reload: () => void } {
  const [, tick] = useState(0);
  useEffect(() => {
    const sync = () => tick((n) => n + 1);
    window.addEventListener(EVENT, sync);
    void load(cache !== null);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return { jobs: cache, failed, reload: () => void load(true) };
}

function put(job: Job) {
  cache = [job, ...(cache ?? []).filter((x) => x.id !== job.id)].sort((a, b) => b.createdAt - a.createdAt);
  emit();
}

export async function createJob(name: string, content: JobContent): Promise<Job> {
  const job = await call<Job>("/api/jobs", { method: "POST", body: JSON.stringify({ name, content }) });
  put(job);
  return job;
}

/** Guarda los cambios como versión nueva (409 → StoreError "conflict"). */
export async function saveJob(id: string, base: number, name: string, content: JobContent): Promise<Job> {
  const job = await call<Job>(`/api/jobs/${id}`, { method: "PUT", body: JSON.stringify({ base, name, content }) });
  put(job);
  return job;
}

export async function deleteJob(id: string): Promise<void> {
  await call(`/api/jobs/${id}`, { method: "DELETE" });
  cache = (cache ?? []).filter((x) => x.id !== id);
  forgetJob(id);
  emit();
}

/** "Contame el laburo" → el puesto ordenado por la IA. */
export async function structureBrief(brief: string, uiLang: "en" | "es"): Promise<{ name: string; content: JobContent }> {
  return call("/api/jobs/structure", { method: "POST", body: JSON.stringify({ brief, uiLang }) });
}
