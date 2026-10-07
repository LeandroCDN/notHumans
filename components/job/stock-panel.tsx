"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { can, useMe } from "@/lib/me";
import {
  StockError,
  connectStock,
  disconnectStock,
  getRobot,
  getStock,
  inspectStock,
  sheetLink,
  syncStock,
} from "@/lib/stock/client";
import { applyMap, catalogCount, columnsAt, rowLine } from "@/lib/stock/map";
import {
  COLUMN_ROLES,
  type ColumnRole,
  type StockInspection,
  type StockMap,
  type StockSource,
  TAB_USES,
  type TabUse,
} from "@/lib/stock/types";
import { useI18n } from "../i18n";

// El stock del puesto: conectar la planilla (compartirla con el robot + pegar el link), revisar cómo la entendimos
// (pestañas, fila de títulos y qué es cada columna; lo privado no sale nunca) y ver el estado de la conexión.
// En un puesto nuevo se hace todo igual y la planilla queda "lista": se conecta cuando se guarda el puesto.

/** Una planilla leída y revisada para un puesto que todavía no se guardó. */
export type PendingStock = { inspection: StockInspection; map: StockMap };

const card = "rounded-[28px] border border-white/10 bg-white/[0.03] p-5 sm:p-6";
const ease = [0.22, 1, 0.36, 1] as const;

export function StockPanel({
  jobId,
  pending = null,
  onPending,
}: {
  /** null = puesto nuevo: la planilla queda en `pending` hasta que se guarde. */
  jobId: string | null;
  pending?: PendingStock | null;
  onPending?: (p: PendingStock | null) => void;
}) {
  const { t: dict } = useI18n();
  const t = dict.jobs.stock;
  const me = useMe();
  const allowed = can(me, "whatsapp");
  const [data, setData] = useState<{ robot: string | null; source: StockSource | null } | null>(null);
  const [review, setReview] = useState<{ inspection: StockInspection; map: StockMap } | null>(null);

  useEffect(() => {
    setData(null);
    setReview(null);
    if (!allowed) return;
    const fallback = () => setData({ robot: null, source: null });
    if (jobId) getStock(jobId).then(setData).catch(fallback);
    else
      getRobot()
        .then(({ robot }) => setData({ robot, source: null }))
        .catch(fallback);
  }, [jobId, allowed]);

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-serif text-2xl">{t.title}</h2>
      <span className="rounded-full border border-acid/30 bg-acid/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-acid">
        {t.badge}
      </span>
    </div>
  );

  if (!allowed) {
    return (
      <section className={card}>
        {header}
        <p className="mt-1 text-sm text-white/55">{t.sub}</p>
        <p className="mt-4 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm text-white/60">
          {t.locked}{" "}
          <Link href="/app/pricing" className="text-acid hover:underline">
            {t.seePlans}
          </Link>
        </p>
      </section>
    );
  }

  const inspected = (inspection: StockInspection) => setReview({ inspection, map: inspection.map });

  return (
    <motion.section layout className={`${card} overflow-hidden`}>
      {header}
      <AnimatePresence mode="wait" initial={false}>
        {!data ? (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            className="mt-4 h-24 animate-pulse rounded-2xl bg-white/[0.04]"
          />
        ) : review ? (
          <Review
            key="review"
            jobId={jobId}
            inspection={review.inspection}
            initialMap={review.map}
            onCancel={() => setReview(null)}
            onReady={(map) => {
              onPending?.({ inspection: review.inspection, map });
              setReview(null);
            }}
            onSaved={(source) => {
              setData({ ...data, source });
              setReview(null);
            }}
          />
        ) : data.source && jobId ? (
          <Connected
            key="connected"
            jobId={jobId}
            source={data.source}
            onChange={(source) => setData({ ...data, source })}
            onDisconnected={() => setData({ ...data, source: null })}
            onReview={inspected}
          />
        ) : pending ? (
          <Pending
            key="pending"
            pending={pending}
            onReview={() => setReview(pending)}
            onRemove={() => onPending?.(null)}
          />
        ) : (
          <Connect key="connect" jobId={jobId} robot={data.robot} onInspected={inspected} />
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function useErrorText() {
  const t = useI18n().t.jobs.stock;
  return (err: unknown) => t.errors[err instanceof StockError ? err.code : "generic"] ?? t.errors.generic;
}

const enter = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease },
};

/** Paso 1: compartir con el robot. Paso 2: pegar el link. */
function Connect({
  jobId,
  robot,
  onInspected,
}: {
  jobId: string | null;
  robot: string | null;
  onInspected: (i: StockInspection) => void;
}) {
  const { t: dict, locale } = useI18n();
  const t = dict.jobs.stock;
  const errorText = useErrorText();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Mientras la IA lee, el texto cambia: primero la planilla, después las columnas.
  useEffect(() => {
    if (!busy) return setPhase(0);
    const id = setTimeout(() => setPhase(1), 1800);
    return () => clearTimeout(id);
  }, [busy]);

  async function read() {
    setBusy(true);
    setError(null);
    try {
      onInspected(await inspectStock(jobId, url, locale));
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <motion.div {...enter} className="mt-1">
      <p className="text-sm text-white/55">{dict.jobs.stock.sub}</p>
      <ol className="mt-5 grid gap-4">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/75">{t.step1}</p>
            {robot && (
              <div className="mt-2 flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-ink/60 py-1.5 pl-3.5 pr-1.5">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-acid">{robot}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(robot);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 font-mono text-[11px] transition hover:bg-acid hover:text-ink"
                >
                  {copied ? t.copied : t.copy}
                </button>
              </div>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <form
            className="min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim() && !busy) void read();
            }}
          >
            <label htmlFor="stock-url" className="text-sm text-white/75">
              {t.step2}
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="stock-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t.linkPh}
                inputMode="url"
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-white/25 focus:border-acid/50"
              />
              <motion.button
                whileTap={{ scale: 0.96 }}
                disabled={!url.trim() || busy}
                className="shrink-0 rounded-full bg-acid px-5 py-2.5 text-sm font-medium text-ink transition disabled:opacity-40"
              >
                {t.read}
              </motion.button>
            </div>
          </form>
        </li>
      </ol>
      <AnimatePresence>
        {busy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <Reading label={phase ? t.thinking : t.reading} />
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p className="mt-4 rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose">{error}</p>
      )}
    </motion.div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-acid/40 font-mono text-[11px] text-acid">
      {n}
    </span>
  );
}

/** Una planilla que se va "leyendo": filas que se iluminan de a una. */
function Reading({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="grid grid-cols-[1fr_2fr_1fr] gap-1.5"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18 }}
          >
            {[0, 1, 2].map((j) => (
              <span key={j} className={`h-2.5 rounded-full ${i === 0 ? "bg-acid/50" : "bg-white/15"}`} />
            ))}
          </motion.div>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mt-3 font-mono text-xs text-white/55"
        >
          {label}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** "Así entendí tu planilla": por pestaña, para qué se usa, en qué fila están los títulos y qué es cada columna. */
function Review({
  jobId,
  inspection,
  initialMap,
  onCancel,
  onReady,
  onSaved,
}: {
  /** null = puesto nuevo: "Listo" deja la planilla lista para conectar al guardar el puesto. */
  jobId: string | null;
  inspection: StockInspection;
  initialMap: StockMap;
  onCancel: () => void;
  onReady: (map: StockMap) => void;
  onSaved: (s: StockSource) => void;
}) {
  const t = useI18n().t.jobs.stock;
  const errorText = useErrorText();
  const [map, setMap] = useState(initialMap);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La vista previa sale de lo mismo que se va a guardar: el mapa aplicado a la planilla (recortada).
  const preview = useMemo(() => applyMap(inspection, map).snapshot, [inspection, map]);

  const patchTab = (i: number, patch: Partial<(typeof map.tabs)[number]>) =>
    setMap((m) => ({ tabs: m.tabs.map((tab, j) => (j === i ? { ...tab, ...patch } : tab)) }));

  function moveHeader(i: number, delta: number) {
    const tab = map.tabs[i];
    const raw = inspection.tabs.find((x) => x.name === tab.name);
    if (!raw) return;
    const headerRow = Math.min(Math.max(1, tab.headerRow + delta), Math.max(1, raw.rows.length));
    patchTab(i, { headerRow, columns: columnsAt(raw, headerRow, tab.columns) });
  }

  async function save() {
    if (!jobId) return onReady(map);
    setSaving(true);
    setError(null);
    try {
      onSaved(await connectStock(jobId, inspection.spreadsheetId, map));
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <motion.div {...enter} className="mt-1">
      <p className="font-serif text-xl text-white/90">{t.reviewTitle(inspection.title)}</p>
      <p className="mt-1 text-sm text-white/55">{t.reviewSub}</p>
      <div className="mt-5 grid gap-3">
        {map.tabs.map((tab, i) => {
          const shown = preview.tabs.find((x) => x.name === tab.name);
          return (
            <motion.div
              key={tab.name}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, ease }}
              className={`rounded-2xl border p-4 transition ${tab.use === "ignore" ? "border-white/5 bg-white/[0.015]" : "border-white/10 bg-white/[0.04]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`truncate font-medium ${tab.use === "ignore" ? "text-white/40" : ""}`}>{tab.name}</p>
                <div role="radiogroup" aria-label={tab.name} className="flex rounded-full bg-white/[0.06] p-0.5">
                  {TAB_USES.map((use) => (
                    <button
                      key={use}
                      type="button"
                      role="radio"
                      aria-checked={tab.use === use}
                      onClick={() => patchTab(i, { use: use as TabUse })}
                      className={`relative rounded-full px-3 py-1 text-xs transition ${tab.use === use ? "text-ink" : "text-white/55 hover:text-white"}`}
                    >
                      {tab.use === use && (
                        <motion.span
                          layoutId={`use-${tab.name}`}
                          className={`absolute inset-0 rounded-full ${use === "ignore" ? "bg-white/70" : "bg-acid"}`}
                        />
                      )}
                      <span className="relative">{t.uses[use]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {tab.use !== "ignore" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-white/45">
                      <button
                        type="button"
                        aria-label={t.up}
                        onClick={() => moveHeader(i, -1)}
                        className="flex size-6 items-center justify-center rounded-full bg-white/[0.06] hover:text-acid"
                      >
                        ↑
                      </button>
                      <span>{t.headerRow(tab.headerRow)}</span>
                      <button
                        type="button"
                        aria-label={t.down}
                        onClick={() => moveHeader(i, 1)}
                        className="flex size-6 items-center justify-center rounded-full bg-white/[0.06] hover:text-acid"
                      >
                        ↓
                      </button>
                    </div>
                    {tab.columns.length ? (
                      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {tab.columns.map((col) => (
                          <label
                            key={col.index}
                            className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-sm transition ${
                              col.role === "private" ? "bg-rose/[0.06] text-white/45" : "bg-white/[0.04]"
                            }`}
                          >
                            <span className="min-w-0 truncate">
                              {col.role === "private" && <span aria-hidden>🔒 </span>}
                              {col.header}
                            </span>
                            <select
                              value={col.role}
                              aria-label={col.header}
                              onChange={(e) =>
                                patchTab(i, {
                                  columns: tab.columns.map((c) =>
                                    c.index === col.index ? { ...c, role: e.target.value as ColumnRole } : c,
                                  ),
                                })
                              }
                              className={`shrink-0 cursor-pointer rounded-lg bg-transparent font-mono text-[11px] uppercase outline-none ${
                                col.role === "private"
                                  ? "text-rose"
                                  : col.role === "detail"
                                    ? "text-white/50"
                                    : "text-acid"
                              }`}
                            >
                              {COLUMN_ROLES.map((r) => (
                                <option key={r} value={r} className="bg-ink">
                                  {t.roles[r]}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-white/40">{t.noColumns}</p>
                    )}
                    <div className="mt-3 rounded-xl bg-ink/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">{t.preview}</p>
                      {shown?.rows.length ? (
                        <ul className="mt-1.5 grid gap-1 font-mono text-[11px] leading-relaxed text-white/70">
                          {shown.rows.slice(0, 3).map((row, k) => (
                            <li key={k} className="truncate">
                              – {rowLine(shown, row)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-xs text-white/35">{t.noRows}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
      {error && (
        <p className="mt-4 rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose">{error}</p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          disabled={saving || !map.tabs.some((x) => x.use !== "ignore")}
          onClick={save}
          className="rounded-full bg-acid px-6 py-2.5 text-sm font-medium text-ink shadow-[0_20px_60px_-20px_rgba(198,255,61,0.6)] disabled:opacity-40"
        >
          {saving ? t.saving : jobId ? t.save : t.ready}
        </motion.button>
        <button type="button" onClick={onCancel} className="text-sm text-white/50 transition hover:text-white">
          {t.cancel}
        </button>
      </div>
    </motion.div>
  );
}

/** Puesto nuevo: la planilla ya está leída y revisada; se conecta cuando se guarde el puesto. */
function Pending({
  pending,
  onReview,
  onRemove,
}: {
  pending: PendingStock;
  onReview: () => void;
  onRemove: () => void;
}) {
  const t = useI18n().t.jobs.stock;
  const preview = useMemo(() => applyMap(pending.inspection, pending.map).snapshot, [pending]);
  const sample = preview.tabs.find((x) => x.use === "catalog") ?? preview.tabs[0];
  return (
    <motion.div {...enter} className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-200">
          <span className="size-1.5 rounded-full bg-amber-200" />
          {t.pendingTitle}
        </span>
        <span className="min-w-0 truncate font-medium">{pending.inspection.title}</span>
      </div>
      <p className="mt-1 text-sm text-white/55">{t.pendingSub}</p>
      {sample?.rows.length ? (
        <div className="mt-4 rounded-2xl bg-ink/60 p-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            {t.preview} · {sample.name}
          </p>
          <ul className="mt-1.5 grid gap-1 font-mono text-[11px] leading-relaxed text-white/70">
            {sample.rows.slice(0, 3).map((row, k) => (
              <li key={k} className="truncate">
                – {rowLine(sample, row)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReview}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm transition hover:border-acid hover:text-acid"
        >
          {t.review}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto px-2 py-2 text-sm text-white/35 transition hover:text-rose"
        >
          {t.remove}
        </button>
      </div>
    </motion.div>
  );
}

function useAgo() {
  const t = useI18n().t.jobs.stock.ago;
  return (at: number | null) => {
    if (!at) return t.now;
    const min = Math.floor((Date.now() - at) / 60_000);
    if (min < 1) return t.now;
    if (min < 60) return t.min(min);
    const h = Math.floor(min / 60);
    return h < 24 ? t.hours(h) : t.days(Math.floor(h / 24));
  };
}

/** Conectada: qué planilla, cuántos productos, cuándo se leyó, y los avisos si cambió o falló. */
function Connected({
  jobId,
  source,
  onChange,
  onDisconnected,
  onReview,
}: {
  jobId: string;
  source: StockSource;
  onChange: (s: StockSource) => void;
  onDisconnected: () => void;
  onReview: (i: StockInspection) => void;
}) {
  const { t: dict, locale } = useI18n();
  const t = dict.jobs.stock;
  const errorText = useErrorText();
  const ago = useAgo();
  const [busy, setBusy] = useState<"sync" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const products = catalogCount(source.snapshot);
  const sample = source.snapshot.tabs.find((x) => x.use === "catalog") ?? source.snapshot.tabs[0];

  async function run(kind: "sync" | "review") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "sync") onChange(await syncStock(jobId));
      else onReview(await inspectStock(jobId, source.spreadsheetId, locale));
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
  }

  async function disconnect() {
    if (!confirm(t.confirmDisconnect)) return;
    try {
      await disconnectStock(jobId);
      onDisconnected();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <motion.div {...enter} className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-acid">
          <span className="size-1.5 animate-pulse rounded-full bg-acid" />
          {t.connected}
        </span>
        <a
          href={sheetLink(source.spreadsheetId)}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate font-medium hover:text-acid"
        >
          {source.title}
        </a>
      </div>
      <p className="mt-1 font-mono text-xs text-white/45">
        {t.summary(products, source.snapshot.tabs.length)} · {t.synced(ago(source.syncedAt))}
      </p>

      {source.status === "needs_review" && (
        <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-200">
          {t.needsReview}
        </p>
      )}
      {source.status === "error" && source.error && (
        <p className="mt-3 rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose">
          {t.failed(t.errors[source.error] ?? t.errors.generic)}
        </p>
      )}

      {sample?.rows.length ? (
        <div className="mt-4 rounded-2xl bg-ink/60 p-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            {t.preview} · {sample.name}
          </p>
          <ul className="mt-1.5 grid gap-1 font-mono text-[11px] leading-relaxed text-white/70">
            {sample.rows.slice(0, 3).map((row, k) => (
              <li key={k} className="truncate">
                – {rowLine(sample, row)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-white/35">{t.refreshNote}</p>

      {error && (
        <p className="mt-3 rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose">{error}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("sync")}
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm transition hover:border-acid hover:text-acid disabled:opacity-50"
        >
          {busy === "sync" ? t.syncing : t.sync}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("review")}
          className={`rounded-full px-4 py-2 text-sm transition disabled:opacity-50 ${
            source.status === "needs_review"
              ? "bg-amber-300 text-ink"
              : "border border-white/15 bg-white/5 hover:border-acid hover:text-acid"
          }`}
        >
          {busy === "review" ? t.reading : t.review}
        </button>
        <a
          href={sheetLink(source.spreadsheetId)}
          target="_blank"
          rel="noreferrer"
          className="px-2 py-2 text-sm text-white/55 transition hover:text-acid"
        >
          {t.open}
        </a>
        <button
          type="button"
          onClick={disconnect}
          className="ml-auto px-2 py-2 text-sm text-white/35 transition hover:text-rose"
        >
          {t.disconnect}
        </button>
      </div>
    </motion.div>
  );
}
