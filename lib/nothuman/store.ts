"use client";

import { useEffect, useState } from "react";
import { limitFrom } from "@/lib/me";
import { type Example, type NotHuman, NotHumanSchema } from "./schema";
import type { VersionInfo } from "./versions";

// Los notHumans viven en Supabase, detrás de /api/nothumans. Acá hay una caché en memoria compartida
// por todas las pantallas, para no pedir la lista de nuevo en cada navegación.
// localStorage queda solo como respaldo: lo que se guardó ahí antes (o si falla la base) se puede subir.

const LOCAL_KEY = "nh_nothumans_v1";
const EVENT = "nh-store-change";

export class StoreError extends Error {
  constructor(
    /** "limit": el plan no alcanza (el detalle dice qué tope). */
    public code: "storage_not_configured" | "unauthorized" | "conflict" | "leak" | "limit" | "generic",
    detail = "",
  ) {
    super(detail || code);
  }
}

let cache: NotHuman[] | null = null;
let loading: Promise<void> | null = null;
let lastError: StoreError | null = null;

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

/** fetch a la API con los errores ya traducidos a StoreError. También lo usa el store de puestos. */
export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } }).catch(() => null);
  if (!res) throw new StoreError("generic", "network");
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data as T;
  if (data.error === "storage_not_configured" || data.error === "unauthorized" || data.error === "conflict") {
    throw new StoreError(data.error);
  }
  if (data.error === "leak") throw new StoreError("leak", data.leak);
  const limit = limitFrom(data);
  if (limit) throw new StoreError("limit", limit.kind);
  throw new StoreError("generic", data.detail ?? `HTTP ${res.status}`);
}

function load(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = call<{ items: NotHuman[] }>("/api/nothumans")
    .then((r) => {
      cache = r.items;
      lastError = null;
    })
    .catch((e: StoreError) => {
      lastError = e;
    })
    .finally(emit);
  return loading;
}

/** Lista reactiva; `list` es `null` mientras carga (para no parpadear un estado vacío). */
export function useNotHumans(): { list: NotHuman[] | null; error: StoreError | null; reload: () => void } {
  const [, tick] = useState(0);
  useEffect(() => {
    const sync = () => tick((n) => n + 1);
    window.addEventListener(EVENT, sync);
    // Siempre refresca al montar (otro usuario o pestaña pudo crear uno), pero muestra la caché mientras.
    void load(cache !== null);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return {
    list: lastError && !cache ? [] : cache,
    error: lastError,
    reload: () => {
      lastError = null;
      emit();
      void load(true);
    },
  };
}

export async function saveNotHuman(n: NotHuman): Promise<boolean> {
  const r = await call<{ created: boolean }>("/api/nothumans", { method: "POST", body: JSON.stringify(n) });
  if (r.created) {
    // Mismo orden que devuelve el server: los más nuevos primero.
    cache = [n, ...(cache ?? []).filter((x) => x.id !== n.id)].sort((a, b) => b.createdAt - a.createdAt);
    emit();
  }
  return r.created;
}

function replaceInCache(n: NotHuman) {
  cache = (cache ?? []).map((x) => (x.id === n.id ? n : x));
  emit();
}

/** Las respuestas corregidas desde el chat pasan a ser ejemplos fijos de una versión nueva. */
export async function saveCorrections(id: string, base: number, corrections: Example[]): Promise<NotHuman> {
  const n = await call<NotHuman>(`/api/nothumans/${id}/versions`, {
    method: "POST",
    body: JSON.stringify({ kind: "corrections", base, corrections }),
  });
  replaceInCache(n);
  return n;
}

/** Vuelve a una versión anterior (como versión nueva: el historial no se pierde). */
export async function restoreVersion(id: string, base: number, version: number): Promise<NotHuman> {
  const n = await call<NotHuman>(`/api/nothumans/${id}/versions`, {
    method: "POST",
    body: JSON.stringify({ kind: "restore", base, version }),
  });
  replaceInCache(n);
  return n;
}

/** Historial de versiones; se vuelve a pedir cuando cambia la versión vigente. */
export function useVersions(id: string, current: number): VersionInfo[] | null {
  const [state, setState] = useState<{ key: string; items: VersionInfo[] } | null>(null);
  const key = `${id}:${current}`;
  useEffect(() => {
    let alive = true;
    call<{ items: VersionInfo[] }>(`/api/nothumans/${id}/versions`)
      .then((r) => alive && setState({ key, items: r.items }))
      .catch(() => alive && setState({ key, items: [] }));
    return () => {
      alive = false;
    };
  }, [id, key]);
  return state?.key === key ? state.items : null;
}

/** Recarga la lista desde el server (por ejemplo, después de un conflicto de versiones). */
export function refreshNotHumans() {
  void load(true);
}

// --- Link público ---------------------------------------------------------------------------------

export type PublicShare = { token: string; createdAt: number; replies: number; maxReplies: number };

export async function getShare(id: string): Promise<PublicShare | null> {
  return (await call<{ share: PublicShare | null }>(`/api/nothumans/${id}/share`)).share;
}

export async function createShare(id: string): Promise<PublicShare> {
  return (await call<{ share: PublicShare }>(`/api/nothumans/${id}/share`, { method: "POST" })).share;
}

export async function revokeShare(id: string): Promise<void> {
  await call(`/api/nothumans/${id}/share`, { method: "DELETE" });
}

/** Asigna un puesto al notHuman (o ninguno). No cambia su versión. */
export async function assignJob(id: string, jobId: string | null): Promise<void> {
  await call(`/api/nothumans/${id}/job`, { method: "PUT", body: JSON.stringify({ jobId }) });
  cache = (cache ?? []).map((x) => (x.id === id ? { ...x, jobId } : x));
  emit();
}

/** Cuando se borra un puesto, los notHumans que trabajaban ahí quedan sin puesto (también en la caché). */
export function forgetJob(jobId: string) {
  if (!cache?.some((x) => x.jobId === jobId)) return;
  cache = cache.map((x) => (x.jobId === jobId ? { ...x, jobId: null } : x));
  emit();
}

export async function deleteNotHuman(id: string) {
  await call(`/api/nothumans/${id}`, { method: "DELETE" });
  cache = (cache ?? []).filter((x) => x.id !== id);
  emit();
}

// --- Respaldo local -------------------------------------------------------------------------------

function readLocal(): NotHuman[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as NotHuman[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: NotHuman[]) {
  try {
    if (list.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Sin localStorage (incógnito estricto, cuota llena): no hay respaldo, pero tampoco rompemos.
  }
  emit();
}

/** Si la base falla al guardar, el notHuman (que costó generar) queda en el navegador para subirlo después. */
export function keepLocally(n: NotHuman) {
  writeLocal([n, ...readLocal().filter((x) => x.id !== n.id)]);
}

/** notHumans que están solo en este navegador (de antes de Supabase o de un guardado que falló). */
export function useLocalLeftovers(): NotHuman[] {
  const [list, setList] = useState<NotHuman[]>([]);
  useEffect(() => {
    const sync = () => setList(readLocal());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return list;
}

/** Sube a la base lo que quedó en el navegador. Lo que no se pudo subir sigue ahí. */
export async function uploadLeftovers(): Promise<{ uploaded: number; failed: number }> {
  const pending: NotHuman[] = [];
  let uploaded = 0;
  for (const n of readLocal()) {
    const parsed = NotHumanSchema.safeParse(n);
    try {
      if (!parsed.success) throw new Error(parsed.error.message);
      await saveNotHuman(parsed.data as NotHuman);
      uploaded++;
    } catch {
      pending.push(n);
    }
  }
  writeLocal(pending);
  if (uploaded) await load(true);
  return { uploaded, failed: pending.length };
}

/** Importa un JSON descargado con "Download JSON". */
export async function importJson(file: File): Promise<{ name: string; created: boolean }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new StoreError("generic", "invalid_json");
  }
  const parsed = NotHumanSchema.safeParse(raw);
  if (!parsed.success) throw new StoreError("generic", "invalid_json");
  const created = await saveNotHuman(parsed.data as NotHuman);
  return { name: parsed.data.name, created };
}

export function downloadJson(n: NotHuman) {
  const blob = new Blob([JSON.stringify(n, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${n.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "nothuman"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
