"use client";

import { type Dict, dictionaries } from "@/lib/i18n/dictionaries";
import { limitFrom, refreshMe } from "@/lib/me";
import type { Conversation } from "@/lib/whatsapp/analyze";
import { buildBlocks, dedupe, pickCanonical } from "./pipeline";
import type { BusinessInput, Example, NotHuman, Profile, Usage } from "./schema";

// Orquesta la generación desde el navegador: un request corto por bloque (con 3 en paralelo)
// y uno final para el perfil. Así no dependemos de colas ni de funciones que corran minutos.

export type Progress = {
  phase: "extract" | "profile";
  blocksDone: number;
  blocksTotal: number;
  examples: number;
  dropped: number;
  notes: string[];
};

export class GenerationError extends Error {
  constructor(
    /** "limit": el plan no alcanza; el detalle es qué tope (generation, nothumans, cost…). */
    public code: "missing_key" | "unauthorized" | "empty" | "limit" | "generic",
    detail = "",
  ) {
    super(detail || code);
  }
}

type BusinessForm = {
  name: string;
  whatTheySell: string;
  where: string;
  audience: string;
  roles: string[];
  notes: string;
};

/** Las opciones del formulario se guardan como claves; al modelo le llegan en inglés legible. */
function toBusinessInput(b: BusinessForm): BusinessInput {
  const en: Dict["create"]["business"] = dictionaries.en.create.business;
  return {
    ...b,
    audience: b.audience ? (en.audiences as Record<string, string>)[b.audience] ?? b.audience : "",
    roles: b.roles.map((r) => (en.roleOptions as Record<string, string>)[r] ?? r),
  };
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new GenerationError("generic", "network");
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data as T;
  if (data.error === "missing_key" || data.error === "unauthorized") throw new GenerationError(data.error);
  const limit = limitFrom(data);
  if (limit) throw new GenerationError("limit", limit.kind);
  throw new GenerationError("generic", data.detail ?? data.error ?? `HTTP ${res.status}`);
}

const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  cacheHit: a.cacheHit + b.cacheHit,
  output: a.output + b.output,
});

type ExtractResponse = { examples: Example[]; styleNotes: string[]; dropped: number; usage: Usage; model: string };
type ProfileResponse = { profile: Profile; usage: Usage; model: string };

export async function generateNotHuman(opts: {
  conversations: Conversation[];
  owner: string;
  business: BusinessForm;
  uiLang: "en" | "es";
  onProgress: (p: Progress) => void;
}): Promise<NotHuman> {
  const { conversations, owner, uiLang, onProgress } = opts;
  const business = toBusinessInput(opts.business);
  const { blocks } = buildBlocks(conversations);
  // Primero se descuenta la generación del plan (si no hay cupo, corta acá, sin gastar nada).
  const { ticket } = await post<{ ticket: string }>("/api/generate/start", {});
  const base = { owner, business, uiLang, ticket };
  try {
    return await run();
  } catch (err) {
    // Falló antes de tener la personalidad: la generación se devuelve.
    await fetch("/api/generate/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    }).catch(() => {});
    throw err;
  } finally {
    refreshMe();
  }

  async function run(): Promise<NotHuman> {

    const progress: Progress = {
      phase: "extract",
      blocksDone: 0,
      blocksTotal: blocks.length,
      examples: 0,
      dropped: 0,
      notes: [],
    };
    onProgress({ ...progress });

    let usage: Usage = { input: 0, cacheHit: 0, output: 0 };
    let model = "";
    const examples: Example[] = [];
    const notes: string[] = [];
    let firstError: GenerationError | null = null;

    // 3 bloques en paralelo. Si uno falla seguimos con el resto; solo cortamos si fallan todos
    // o si el error es de configuración (sin key, sin sesión), que no se arregla reintentando.
    let next = 0;
    const worker = async () => {
      while (next < blocks.length) {
        const block = blocks[next++];
        try {
          const r = await post<ExtractResponse>("/api/generate/extract", { ...base, block });
          examples.push(...r.examples);
          notes.push(...r.styleNotes);
          usage = addUsage(usage, r.usage);
          model = r.model;
          progress.examples += r.examples.length;
          progress.dropped += r.dropped;
          progress.notes = [...progress.notes, ...r.styleNotes].slice(-6);
        } catch (err) {
          const e = err instanceof GenerationError ? err : new GenerationError("generic", String(err));
          if (e.code !== "generic") throw e;
          firstError ??= e;
        }
        progress.blocksDone++;
        onProgress({ ...progress });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, blocks.length) }, worker));

    const unique = dedupe(examples);
    if (unique.length === 0) throw firstError ?? new GenerationError("empty");

    const canonical = pickCanonical(unique);
    onProgress({ ...progress, phase: "profile" });
    const sample = [...unique.filter((_, i) => canonical.has(i)), ...unique.filter((_, i) => !canonical.has(i))].slice(0, 30);
    const p = await post<ProfileResponse>("/api/generate/profile", {
      ...base,
      styleNotes: notes.slice(0, 120),
      examples: sample,
    });
    usage = addUsage(usage, p.usage);

    return {
      id: crypto.randomUUID(),
      name: opts.business.name.trim() || owner,
      owner,
      createdAt: Date.now(),
      version: 1,
      business,
      profile: p.profile,
      examples: unique.map((e, i) => ({ ...e, canonical: canonical.has(i) })),
      stats: {
        conversations: conversations.length,
        examplesFound: unique.length,
        examplesDropped: progress.dropped,
        usage,
        model: p.model || model,
      },
    };
  }
}
