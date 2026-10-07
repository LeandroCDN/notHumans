"use client";

import { limitFrom } from "@/lib/me";
import type { StockInspection, StockMap, StockSource } from "./types";

// El stock de un puesto desde el navegador. Los errores traen un código (not_shared, not_owner…) para decirle
// al dueño exactamente qué hacer.

export class StockError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } }).catch(() => null);
  if (!res) throw new StockError("generic");
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data as T;
  // Sin plan para conexiones → "limit"; sin cupo de IA del mes (leer la planilla usa IA) → "quota".
  const limit = limitFrom(data);
  if (limit) throw new StockError(limit.kind === "connections" ? "limit" : "quota");
  throw new StockError(typeof data.error === "string" ? data.error : "generic");
}

const base = (jobId: string) => `/api/jobs/${jobId}/stock`;

export const getStock = (jobId: string) => call<{ robot: string | null; source: StockSource | null }>(base(jobId));

/** El mail del robot, para un puesto que todavía no se guardó. */
export const getRobot = () => call<{ robot: string | null }>("/api/stock");

/** Lee la planilla y propone el mapa. Sin puesto (uno nuevo), se revisa igual y se conecta al guardarlo. */
export const inspectStock = (jobId: string | null, url: string, uiLang: "en" | "es") =>
  call<StockInspection>(jobId ? `${base(jobId)}/inspect` : "/api/stock/inspect", {
    method: "POST",
    body: JSON.stringify({ url, uiLang }),
  });

export const connectStock = (jobId: string, spreadsheetId: string, map: StockMap) =>
  call<StockSource>(base(jobId), { method: "PUT", body: JSON.stringify({ spreadsheetId, map }) });

export const syncStock = (jobId: string) => call<StockSource>(`${base(jobId)}/sync`, { method: "POST" });

export const disconnectStock = (jobId: string) => call<{ ok: true }>(base(jobId), { method: "DELETE" });

export const sheetLink = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
