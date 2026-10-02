"use client";

import { useEffect, useState } from "react";
import { type NotHuman, NotHumanSchema } from "./schema";

// Los notHumans viven en Supabase, detrás de /api/nothumans. Acá hay una caché en memoria compartida
// por todas las pantallas, para no pedir la lista de nuevo en cada navegación.
// localStorage queda solo como respaldo: lo que se guardó ahí antes (o si falla la base) se puede subir.

const LOCAL_KEY = "nh_nothumans_v1";
const EVENT = "nh-store-change";

export class StoreError extends Error {
  constructor(
    public code: "storage_not_configured" | "unauthorized" | "generic",
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

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } }).catch(() => null);
  if (!res) throw new StoreError("generic", "network");
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data as T;
  if (data.error === "storage_not_configured" || data.error === "unauthorized") throw new StoreError(data.error);
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
