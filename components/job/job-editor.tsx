"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { jobManual } from "@/lib/job/manual";
import { type Job, type JobContent, RULE_KINDS, type RuleKind, emptyJobContent } from "@/lib/job/schema";
import { createJob, deleteJob, saveJob, structureBrief } from "@/lib/job/store";
import type { NotHuman } from "@/lib/nothuman/schema";
import { StoreError } from "@/lib/nothuman/store";
import { StockError, connectStock } from "@/lib/stock/client";
import { useI18n } from "../i18n";
import { storeErrorMessage } from "../nothuman/store-ui";
import { RecordButton } from "./record-button";
import { type PendingStock, StockPanel } from "./stock-panel";

// Editor de un puesto: "Contame el laburo" arriba, las secciones editables abajo y el manual del empleado al costado
// (el texto exacto que va a leer el notHuman). Guardar crea una versión nueva.

type Props = {
  /** null = puesto nuevo. */
  job: Job | null;
  workers: NotHuman[];
  onDirty: (dirty: boolean) => void;
  /** Se acaba de guardar (al crear, el editor se vuelve a montar con el id nuevo: así no se pierde el aviso). */
  justSaved?: number | null;
  /** Si al crear el puesto no se pudo conectar la planilla, el aviso (sobrevive al remontar, como `justSaved`). */
  saveWarning?: string | null;
  onSaved: (job: Job, warning?: string) => void;
};

const field =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-white/25 focus:border-acid/50";
const card = "rounded-[28px] border border-white/10 bg-white/[0.03] p-5 sm:p-6";

export function JobEditor({ job, workers, onDirty, justSaved, saveWarning, onSaved }: Props) {
  const { t: dict, locale } = useI18n();
  const t = dict.jobs;
  const router = useRouter();
  const [name, setName] = useState(job?.name ?? "");
  const [content, setContent] = useState<JobContent>(job?.content ?? emptyJobContent(locale));
  const [saving, setSaving] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; conflict?: boolean } | null>(
    saveWarning ? { ok: false, text: saveWarning } : justSaved ? { ok: true, text: dict.jobs.saved(justSaved) } : null,
  );
  // Puesto nuevo con la planilla ya leída y revisada: se conecta al guardar.
  const [pendingStock, setPendingStock] = useState<PendingStock | null>(null);

  // Hay cambios si difiere de lo guardado (o si es nuevo y ya se escribió algo).
  const saved = useMemo(() => JSON.stringify([job?.name ?? "", job?.content ?? emptyJobContent(locale)]), [job, locale]);
  const dirty = JSON.stringify([name, content]) !== saved || !!pendingStock;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (patch: Partial<JobContent>) => {
    setContent((c) => ({ ...c, ...patch }));
    setMessage(null);
  };
  const manual = jobManual(name.trim() || t.defaultName, content);

  async function sort() {
    const hasContent = content.rules.length || content.business.what || content.handoff.triggers.length;
    if (hasContent && !confirm(t.brief.replace)) return;
    setSorting(true);
    setMessage(null);
    try {
      const r = await structureBrief(content.brief, locale);
      setContent({ ...r.content, brief: content.brief });
      if (!name.trim() && r.name) setName(r.name);
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
    setSorting(false);
  }

  function errorText(err: unknown): string {
    if (err instanceof StoreError && err.code === "generic" && /missing_key|HTTP 500/.test(err.message)) {
      return dict.generate.errors.missing_key;
    }
    return storeErrorMessage(dict.store, err);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const finalName = name.trim() || t.defaultName;
    try {
      const next = job ? await saveJob(job.id, job.version, finalName, content) : await createJob(finalName, content);
      let warning: string | undefined;
      if (!job && pendingStock) {
        try {
          await connectStock(next.id, pendingStock.inspection.spreadsheetId, pendingStock.map);
        } catch (err) {
          const code = err instanceof StockError ? err.code : "generic";
          warning = t.stock.connectFailed(t.stock.errors[code] ?? t.stock.errors.generic);
        }
        setPendingStock(null);
      }
      setName(next.name);
      setContent(next.content);
      setMessage(warning ? { ok: false, text: warning } : { ok: true, text: t.saved(next.version) });
      onDirty(false);
      onSaved(next, warning);
      if (!job) router.replace(`/app/jobs?job=${next.id}`, { scroll: false });
    } catch (err) {
      const conflict = err instanceof StoreError && err.code === "conflict";
      setMessage({ ok: false, text: errorText(err), conflict });
    }
    setSaving(false);
  }

  async function remove() {
    if (!job || !confirm(t.confirmDelete)) return;
    try {
      await deleteJob(job.id);
      onDirty(false);
      router.replace("/app/jobs", { scroll: false });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-acid">{job ? t.eyebrow2(job.version) : t.newEyebrow}</p>
      <label className="sr-only" htmlFor="job-name">
        {t.namePh}
      </label>
      <input
        id="job-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.namePh}
        maxLength={120}
        className="mt-2 w-full bg-transparent font-serif text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.95] tracking-tight outline-none placeholder:text-white/20"
      />
      <p className="mt-2 font-mono text-xs text-white/45">
        {workers.length ? t.workers(workers.map((w) => w.name).join(" · ")) : t.noWorkers}
      </p>

      <div className="mt-8 flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Contame el laburo */}
          <section className="rounded-[28px] border border-acid/30 bg-acid/[0.05] p-5 sm:p-6">
            <h2 className="font-serif text-3xl">{t.brief.title}</h2>
            <p className="mt-1 text-sm text-white/55">{t.brief.sub}</p>
            <label className="sr-only" htmlFor="job-brief">
              {t.brief.title}
            </label>
            <textarea
              id="job-brief"
              value={content.brief}
              onChange={(e) => set({ brief: e.target.value })}
              placeholder={t.brief.ph}
              rows={5}
              maxLength={6000}
              className={`${field} mt-4 resize-y leading-relaxed`}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RecordButton lang={locale} onText={(text) => set({ brief: [content.brief.trim(), text].filter(Boolean).join("\n") })} />
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => void sort()}
                disabled={sorting || content.brief.trim().length < 10}
                className="rounded-full bg-acid px-5 py-2.5 text-sm font-medium text-ink transition hover:scale-[1.03] disabled:opacity-40"
              >
                {sorting ? t.brief.sorting : t.brief.sort}
              </motion.button>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* El negocio */}
            <section className={card}>
              <h2 className="font-serif text-2xl">{t.business.title}</h2>
              <div className="mt-4 grid gap-3">
                {(["what", "sells", "audience", "where"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{t.business[k]}</span>
                    <input
                      value={content.business[k]}
                      maxLength={300}
                      onChange={(e) => set({ business: { ...content.business, [k]: e.target.value } })}
                      className={`${field} mt-1`}
                    />
                  </label>
                ))}
              </div>
            </section>

            {/* Horario */}
            <section className={card}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-2xl">{t.schedule.title}</h2>
                <span className="font-mono text-[10px] text-white/35">{content.schedule.tz}</span>
              </div>
              <div className="mt-4 grid gap-1.5">
                {content.schedule.days.map((d, i) => {
                  const setDay = (patch: Partial<typeof d>) =>
                    set({
                      schedule: {
                        ...content.schedule,
                        days: content.schedule.days.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                      },
                    });
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex w-32 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={d.open}
                          onChange={(e) => setDay({ open: e.target.checked })}
                          className="size-4 accent-[var(--color-acid)]"
                        />
                        <span className={d.open ? "" : "text-white/40"}>{t.schedule.days[i]}</span>
                      </label>
                      {d.open ? (
                        <span className="flex items-center gap-1.5 font-mono text-xs">
                          <input
                            type="time"
                            value={d.from}
                            aria-label={`${t.schedule.days[i]} · from`}
                            onChange={(e) => e.target.value && setDay({ from: e.target.value })}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 outline-none [color-scheme:dark] focus:border-acid/50"
                          />
                          –
                          <input
                            type="time"
                            value={d.to}
                            aria-label={`${t.schedule.days[i]} · to`}
                            onChange={(e) => e.target.value && setDay({ to: e.target.value })}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 outline-none [color-scheme:dark] focus:border-acid/50"
                          />
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-white/35">{t.schedule.closed}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <label className="mt-4 block">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{t.schedule.offHours}</span>
                <input
                  value={content.schedule.offHours}
                  maxLength={400}
                  placeholder={t.schedule.offHoursPh}
                  onChange={(e) => set({ schedule: { ...content.schedule, offHours: e.target.value } })}
                  className={`${field} mt-1`}
                />
              </label>
            </section>
          </div>

          {/* Reglas */}
          <section className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-2xl">{t.rules.title}</h2>
              <span className="font-mono text-[11px] text-white/40">{dict.jobs.tab.rules(content.rules.length)}</span>
            </div>
            <p className="mt-1 text-sm text-white/45">{t.rules.sub}</p>
            <ul className="mt-4 grid gap-2">
              <AnimatePresence initial={false}>
                {content.rules.map((r, i) => (
                  <motion.li
                    key={i}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2"
                  >
                    <select
                      value={r.kind}
                      aria-label={t.rules.title}
                      onChange={(e) =>
                        set({ rules: content.rules.map((x, j) => (j === i ? { ...x, kind: e.target.value as RuleKind } : x)) })
                      }
                      className={`w-28 shrink-0 cursor-pointer rounded-2xl border border-white/10 bg-white/[0.04] px-2.5 py-2.5 font-mono text-[11px] uppercase outline-none ${
                        r.kind === "never" ? "text-rose" : r.kind === "always" ? "text-acid" : "text-white/60"
                      }`}
                    >
                      {RULE_KINDS.map((k) => (
                        <option key={k} value={k} className="bg-ink">
                          {t.rules.kinds[k]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={r.text}
                      maxLength={400}
                      placeholder={t.rules.ph}
                      aria-label={t.rules.title}
                      onChange={(e) =>
                        set({ rules: content.rules.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })
                      }
                      className={field}
                    />
                    <button
                      type="button"
                      aria-label={t.rules.remove}
                      onClick={() => set({ rules: content.rules.filter((_, j) => j !== i) })}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/35 transition hover:bg-rose/10 hover:text-rose"
                    >
                      ✕
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {content.rules.length < 40 && (
              <button
                type="button"
                onClick={() => set({ rules: [...content.rules, { kind: "always", text: "" }] })}
                className="mt-3 font-mono text-xs text-acid transition hover:text-white"
              >
                {t.rules.add}
              </button>
            )}
          </section>

          <StockPanel jobId={job?.id ?? null} pending={pendingStock} onPending={setPendingStock} />

          <div className="grid gap-4 lg:grid-cols-2">
            <HandoffCard content={content} set={set} />
            {/* Fuentes conectadas: pronto */}
            <section className="rounded-[28px] border border-dashed border-white/15 p-5 sm:p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-2xl text-white/75">{t.sources.title}</h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-violet">{t.sources.soon}</span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-white/50">
                {[
                  [t.sources.calendar, t.sources.calendarSub],
                  [t.sources.mail, t.sources.mailSub],
                ].map(([a, b]) => (
                  <div key={a} className="flex justify-between rounded-2xl bg-white/[0.04] px-3.5 py-2.5">
                    <span>{a}</span>
                    <span className="font-mono text-[11px]">{b}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Manual del empleado + guardar */}
        <aside className="flex w-full shrink-0 flex-col gap-3 xl:sticky xl:top-4 xl:w-[400px]">
          <div className="rounded-[28px] bg-bone p-6 text-[#17161c]">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#17161c]/50">{t.manual.eyebrow}</p>
            <p className="mt-1 font-serif text-3xl leading-tight">{t.manual.title}</p>
            <pre className="mt-4 max-h-[46vh] overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[#17161c]/85">
              {manual}
            </pre>
            <p className="mt-4 font-mono text-[11px] text-[#17161c]/50">{t.manual.tokens(Math.round(manual.length / 4))}</p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => void save()}
            disabled={saving || (!dirty && !!job)}
            className="rounded-full bg-acid px-5 py-3.5 text-[15px] font-medium text-ink shadow-[0_0_50px_-15px_rgba(198,255,61,0.7)] transition hover:scale-[1.02] disabled:opacity-40"
          >
            {saving ? t.saving : t.save}
          </motion.button>
          <AnimatePresence mode="wait">
            {message ? (
              <motion.p
                key={message.text}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-center text-sm ${message.ok ? "text-acid" : "text-rose"}`}
              >
                {message.ok ? "✓ " : ""}
                {message.text}
              </motion.p>
            ) : dirty ? (
              <motion.p key="dirty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center font-mono text-[11px] text-white/40">
                {t.unsaved}
              </motion.p>
            ) : null}
          </AnimatePresence>
          {job && workers[0] && (
            <Link
              href={`/app/explore?nh=${workers[0].id}`}
              className="rounded-full border border-white/15 px-5 py-3 text-center text-sm transition hover:border-acid hover:text-acid"
            >
              {t.try(workers[0].name)}
            </Link>
          )}
          {job && (
            <button
              type="button"
              onClick={() => void remove()}
              className="mt-2 font-mono text-[11px] text-rose/70 transition hover:text-rose"
            >
              {t.delete}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function HandoffCard({ content, set }: { content: JobContent; set: (patch: Partial<JobContent>) => void }) {
  const t = useI18n().t.jobs.handoff;
  const [draft, setDraft] = useState("");
  const add = () => {
    const x = draft.trim();
    if (!x || content.handoff.triggers.includes(x) || content.handoff.triggers.length >= 15) return;
    set({ handoff: { ...content.handoff, triggers: [...content.handoff.triggers, x] } });
    setDraft("");
  };
  return (
    <section className={card}>
      <h2 className="font-serif text-2xl">{t.title}</h2>
      <p className="mt-1 text-sm text-white/45">{t.sub}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {content.handoff.triggers.map((x) => (
          <span key={x} className="flex items-center gap-1 rounded-full border border-rose/40 py-1 pl-3 pr-1 text-sm text-[#ff8fb7]">
            {x}
            <button
              type="button"
              aria-label={t.remove(x)}
              onClick={() => set({ handoff: { ...content.handoff, triggers: content.handoff.triggers.filter((y) => y !== x) } })}
              className="flex size-6 items-center justify-center rounded-full text-xs transition hover:bg-rose/20"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          maxLength={200}
          placeholder={t.ph}
          aria-label={t.title}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={field}
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-full border border-white/15 px-4 text-sm transition hover:border-acid hover:text-acid"
        >
          {t.add}
        </button>
      </div>
      <label className="mt-4 block">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{t.message}</span>
        <input
          value={content.handoff.message}
          maxLength={300}
          placeholder={t.messagePh}
          onChange={(e) => set({ handoff: { ...content.handoff, message: e.target.value } })}
          className={`${field} mt-1`}
        />
      </label>
    </section>
  );
}
