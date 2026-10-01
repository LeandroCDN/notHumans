"use client";

import { useEffect, useState } from "react";
import type { NotHuman } from "./schema";

// Por ahora los notHumans viven en el localStorage del navegador. Cuando entre Supabase,
// esto se reemplaza por llamadas a la API y el resto de la app no se entera.

const KEY = "nh_nothumans_v1";
const EVENT = "nh-store-change";

function read(): NotHuman[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as NotHuman[]) : [];
  } catch {
    return [];
  }
}

function write(list: NotHuman[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function saveNotHuman(n: NotHuman): boolean {
  return write([n, ...read().filter((x) => x.id !== n.id)]);
}

export function deleteNotHuman(id: string) {
  write(read().filter((x) => x.id !== id));
}

/** Lista reactiva; `null` mientras no se leyó (para no parpadear un estado vacío). */
export function useNotHumans(): NotHuman[] | null {
  const [list, setList] = useState<NotHuman[] | null>(null);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
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
