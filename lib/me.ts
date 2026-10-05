"use client";

import { useEffect, useState } from "react";
import type { Me, WireLimits } from "./plans";

// La cuenta en el navegador: plan, topes y consumo del mes. Una caché compartida por todas las pantallas;
// después de algo que consume (generar, chatear, transcribir) se refresca sola con `refreshMe()`.

const EVENT = "nh-me-change";
let cache: Me | null = null;
let loading: Promise<void> | null = null;

const emit = () => window.dispatchEvent(new Event(EVENT));

function load(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = fetch("/api/me")
    .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
    .then((me) => {
      if (me) cache = me;
    })
    .catch(() => {})
    .finally(emit);
  return loading;
}

export function useMe(): Me | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const sync = () => tick((n) => n + 1);
    window.addEventListener(EVENT, sync);
    void load(cache !== null);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return cache;
}

/** Vuelve a pedir la cuenta (el consumo cambió). */
export function refreshMe() {
  void load(true);
}

export async function requestAccess(): Promise<void> {
  const res = await fetch("/api/me/request-access", { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (cache) cache = { ...cache, accessRequestedAt: cache.accessRequestedAt ?? Date.now() };
  emit();
}

/** Lo que se puede hacer con el plan, para mostrar candados antes de que el server diga que no. */
export function can(me: Me | null, what: "create" | "jobs" | "chat" | "share" | "proModel" | "audio"): boolean {
  if (!me) return true; // mientras carga, no bloqueamos nada (el server igual controla)
  const l: WireLimits = me.limits;
  const room = (max: number | null, used: number) => max === null || used < max;
  switch (what) {
    case "create":
      return room(l.nothumans, me.used.nothumans) && room(l.generations, me.used.generations);
    case "jobs":
      return l.jobs === null || l.jobs > 0;
    case "chat":
      return room(l.replies, me.used.replies);
    case "share":
      return l.shareLinks;
    case "proModel":
      return l.proModel;
    case "audio":
      return room(l.audioMinutes, me.used.audioMinutes);
  }
}

/** Lo que dice el server cuando no hay cupo (402). */
export type LimitInfo = { kind: string; limit: number | null; resetsAt: number };

export function limitFrom(data: unknown): LimitInfo | null {
  const d = data as { error?: string; kind?: string; limit?: number | null; resetsAt?: number } | null;
  return d?.error === "limit" && typeof d.kind === "string"
    ? { kind: d.kind, limit: d.limit ?? null, resetsAt: d.resetsAt ?? 0 }
    : null;
}
