import { findLeak } from "./pipeline";
import type { Example, NotHuman, StoredExample } from "./schema";

// Versiones de un notHuman: cada cambio crea una nueva (nada se pisa). Funciones puras, las usa el server.

/** Qué cambió en una versión. Se guarda como código y la UI lo traduce. */
export type VersionNote = { kind: "generated" } | { kind: "corrections"; count: number } | { kind: "restored"; from: number };

export function encodeNote(n: VersionNote): string {
  return n.kind === "generated" ? "generated" : n.kind === "corrections" ? `corrections:${n.count}` : `restored:${n.from}`;
}

export function decodeNote(s: string): VersionNote {
  const [kind, value] = s.split(":");
  if (kind === "corrections") return { kind, count: Number(value) || 0 };
  if (kind === "restored") return { kind, from: Number(value) || 0 };
  return { kind: "generated" };
}

export type VersionInfo = { version: number; note: VersionNote; createdAt: number; createdBy: string; examples: number };

/** Primer dato concreto que se coló en las correcciones, para rechazarlas (la persona tiene que ser reutilizable). */
export function correctionsLeak(corrections: Example[]): string | null {
  for (const c of corrections) {
    const leak = findLeak(c);
    if (leak) return leak;
  }
  return null;
}

const key = (e: Example) => `${e.context}\n${e.reply.join("\n")}`.toLowerCase();

/**
 * Las correcciones entran primero, fijas en el prompt y marcadas. Si una corrige la misma pregunta
 * con la misma respuesta que ya estaba, no se duplica.
 */
export function withCorrections(nh: NotHuman, corrections: Example[]): StoredExample[] {
  const added: StoredExample[] = corrections.map((c) => ({ ...c, canonical: true, corrected: true }));
  const seen = new Set(added.map(key));
  return [...added, ...nh.examples.filter((e) => !seen.has(key(e)))];
}
