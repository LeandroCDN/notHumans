import "server-only";
import { LimitError, metered, requireFeature } from "@/lib/account";
import type { SessionUser } from "@/lib/auth";
import { stock } from "@/lib/db/stock";
import { SheetError, credentials, fileOwners, readSpreadsheet } from "@/lib/google/sheets";
import { llmJson } from "@/lib/llm";
import { RequestError } from "@/lib/nothuman/api";
import { stockMapPrompt } from "@/lib/nothuman/prompts";
import { fixture } from "./fixtures";
import { applyMap, heuristicMap, normalizeMap, previewText, sheetIdFromUrl } from "./map";
import {
  type RawSheet,
  type StockInspection,
  type StockMap,
  StockMapSchema,
  type StockSnapshot,
  type StockSource,
} from "./types";

// Conectar, revisar y sincronizar la planilla de stock de un puesto. La planilla se lee siempre en el server
// (lo que manda el navegador es solo el mapa revisado) y lo privado se descarta antes de guardar.

/** Cada cuánto se vuelve a leer la planilla cuando el notHuman la necesita. */
export const STALE_MS = 5 * 60_000;
const DEMO_ROBOT = "nothumans-stock@demo.iam.gserviceaccount.com";

/** Sin la clave del robot en desarrollo (o con LLM_MOCK=1) se usan planillas de mentira. */
function mockSheets(): boolean {
  return !credentials() && (process.env.NODE_ENV !== "production" || process.env.LLM_MOCK === "1");
}

/** El mail que el dueño tiene que agregar como Lector en su planilla. */
export function robotEmail(): string | null {
  return credentials()?.client_email ?? (mockSheets() ? DEMO_ROBOT : null);
}

async function read(id: string): Promise<RawSheet> {
  const c = credentials();
  if (c) return readSpreadsheet(c, id);
  if (mockSheets()) return structuredClone(fixture(id));
  throw new SheetError("not_configured");
}

/**
 * Un robot para todos: otro cliente podría pegar el link de una planilla que alguien más le compartió.
 * Por eso tiene que ser de la cuenta de Google con la que entra (los admins pueden conectar cualquiera).
 */
async function checkOwner(user: SessionUser, id: string) {
  const c = credentials();
  if (!c || user.admin) return;
  const owners = await fileOwners(c, id);
  const mail = user.email?.toLowerCase();
  if (!mail || !owners.includes(mail)) throw new SheetError("not_owner");
}

/** Lee la planilla y propone el mapa (con IA; si el modelo falla, por los títulos). Para revisar antes de guardar. */
export async function inspect(
  user: SessionUser,
  jobId: string,
  url: string,
  lang: "es" | "en",
): Promise<StockInspection> {
  requireFeature(user, "connections");
  const id = sheetIdFromUrl(url);
  if (!id) throw new RequestError("bad_url", 400);
  await checkOwner(user, id);
  const raw = await read(id);
  if (!raw.tabs.some((t) => t.rows.length)) throw new RequestError("empty_sheet", 422);

  // Si ya estaba conectada esta misma planilla, "revisar" parte del mapa guardado (sin gastar IA).
  const current = await stock().get(jobId);
  let proposal: StockMap;
  if (current?.spreadsheetId === id) {
    proposal = current.map;
  } else {
    try {
      const { data } = await metered(user, "structure", () =>
        llmJson({
          task: "stock_map",
          system: stockMapPrompt(lang),
          user: previewText(raw),
          schema: StockMapSchema,
          maxTokens: 3000,
          temperature: 0,
        }),
      );
      proposal = data;
    } catch (err) {
      if (err instanceof LimitError) throw err;
      console.error("stock map:", err);
      proposal = heuristicMap(raw);
    }
  }
  // Al navegador va un pedazo (para revisar y mostrar la vista previa), no la planilla entera.
  return {
    spreadsheetId: id,
    title: raw.title,
    tabs: raw.tabs.map((t) => ({ name: t.name, rows: t.rows.slice(0, 40).map((r) => r.slice(0, 26)) })),
    map: normalizeMap(raw, proposal),
  };
}

/** Guarda el mapa revisado y la primera copia. */
export async function connect(
  user: SessionUser,
  jobId: string,
  spreadsheetId: string,
  map: StockMap,
): Promise<StockSource> {
  requireFeature(user, "connections");
  await checkOwner(user, spreadsheetId);
  const raw = await read(spreadsheetId);
  const clean = normalizeMap(raw, map);
  const { snapshot } = applyMap(raw, clean);
  return stock().save(
    { jobId, spreadsheetId, title: raw.title, map: clean, snapshot, status: "ok", error: null, syncedAt: Date.now() },
    user.id,
  );
}

/** Vuelve a leer la planilla. Si falla, queda la copia anterior y se anota el error para mostrárselo al dueño. */
export async function sync(source: StockSource, userId: string): Promise<StockSource> {
  try {
    const raw = await read(source.spreadsheetId);
    const { snapshot, needsReview } = applyMap(raw, source.map);
    return await stock().save(
      {
        ...source,
        title: raw.title,
        snapshot,
        status: needsReview ? "needs_review" : "ok",
        error: null,
        syncedAt: Date.now(),
      },
      userId,
    );
  } catch (err) {
    const code = err instanceof SheetError ? err.code : "google_error";
    if (!(err instanceof SheetError)) console.error("stock sync:", err);
    return stock().save({ ...source, status: "error", error: code, syncedAt: Date.now() }, userId);
  }
}

/**
 * El stock para responder: la copia guardada, refrescada si tiene más de 5 minutos (sin hacer esperar más de
 * unos segundos: si Google tarda, se responde con la copia que había). Nunca rompe una respuesta.
 */
export async function stockForReply(jobId: string, userId: string): Promise<StockSnapshot | null> {
  try {
    let source = await stock().get(jobId);
    if (!source) return null;
    if (!source.syncedAt || Date.now() - source.syncedAt > STALE_MS) {
      const fresh = sync(source, userId);
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
      source = (await Promise.race([fresh, timeout])) ?? source;
    }
    return source.snapshot.tabs.length ? source.snapshot : null;
  } catch (err) {
    console.error("stock for reply:", err);
    return null;
  }
}
