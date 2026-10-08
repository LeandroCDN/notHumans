"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { scheduleSummary } from "@/lib/job/manual";
import { type Job, type JobContent } from "@/lib/job/schema";
import { createJob, structureBrief, useJobs } from "@/lib/job/store";
import { DEFAULT_MODEL_ID } from "@/lib/llm/models";
import { can, useMe } from "@/lib/me";
import { sendChat } from "@/lib/nothuman/chat";
import { GenerationError, type Progress, generateNotHuman } from "@/lib/nothuman/generate";
import type { NotHuman } from "@/lib/nothuman/schema";
import { assignJob, createShare, keepLocally, saveNotHuman, useNotHumans } from "@/lib/nothuman/store";
import { buildConversations, detectOwner, usableChats } from "@/lib/whatsapp/analyze";
import { type ChatFile, readChatFiles } from "@/lib/whatsapp/files";
import { parseExport } from "@/lib/whatsapp/parse";
import { SAMPLE_SETS, type SampleSet, loadSampleSet } from "@/lib/whatsapp/sample";
import { Bubble, Dots } from "../chat/bubbles";
import { useConversation } from "../chat/use-conversation";
import { FileList, type FileEntry, OwnerPicker } from "../create/analysis";
import { EMPTY_BUSINESS } from "../create/business-form";
import { HowToExport } from "../create/create-view";
import { Dropzone } from "../create/dropzone";
import { useI18n } from "../i18n";
import { RecordButton } from "../job/record-button";
import { StockPanel } from "../job/stock-panel";
import { storeErrorMessage } from "../nothuman/store-ui";

// El recorrido para el primer notHuman: "contratar a un empleado" en 5 pasos, sin las palabras notHuman ni puesto.
// Crea lo mismo que la app por detrás (notHuman, puesto, stock, link). La generación arranca al terminar el paso 1
// y corre mientras el dueño cuenta su negocio, así no se nota la espera. Lo que ya existe (el notHuman generado y
// el puesto) se recuerda en el navegador para retomar si se recarga la página.

const STORAGE = "nh-start";
type Saved = { nhId?: string; jobId?: string };
const ease = [0.22, 1, 0.36, 1] as const;
const card = "rounded-[32px] border border-white/10 bg-white/[0.03] p-5 sm:p-8";

function readSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as Saved;
  } catch {
    return {};
  }
}
function writeSaved(s: Saved) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(s));
  } catch {}
}

type Gen =
  | { kind: "idle" }
  | { kind: "running"; progress: Progress }
  | { kind: "error"; message: string }
  | { kind: "done"; nh: NotHuman };

export function StartView() {
  const { t: dict, locale } = useI18n();
  const t = dict.start;
  const { list } = useNotHumans();
  const { jobs } = useJobs();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<Saved>({});
  const [gen, setGen] = useState<Gen>({ kind: "idle" });
  const [job, setJob] = useState<Job | null>(null);
  const [resumed, setResumed] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  // Paso 1: los chats.
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pickedOwner, setPickedOwner] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const chats = useMemo(() => entries.flatMap((e) => ("chat" in e ? [e.chat] : [])), [entries]);
  const guess = useMemo(() => detectOwner(chats), [chats]);
  const owner = pickedOwner && guess.candidates.some((c) => c.name === pickedOwner) ? pickedOwner : guess.owner;
  const conversations = useMemo(() => (owner ? buildConversations(chats, owner) : []), [chats, owner]);

  // Retomar: si ya había un notHuman generado (y un puesto), se sigue desde "Probalo".
  useEffect(() => {
    if (resumed || !list || !jobs) return;
    const s = readSaved();
    const nh = s.nhId ? list.find((n) => n.id === s.nhId) : undefined;
    const j = s.jobId ? jobs.find((x) => x.id === s.jobId) : undefined;
    setSaved({ nhId: nh?.id, jobId: j?.id });
    if (j) setJob(j);
    if (nh) {
      setGen({ kind: "done", nh });
      setStep(j ? 3 : 1);
    }
    setResumed(true);
  }, [list, jobs, resumed]);

  const remember = (patch: Saved) =>
    setSaved((s) => {
      const next = { ...s, ...patch };
      writeSaved(next);
      return next;
    });

  function go(n: number) {
    setStep(n);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function generate() {
    if (!owner) return;
    setGen({
      kind: "running",
      progress: { phase: "extract", blocksDone: 0, blocksTotal: 1, examples: 0, dropped: 0, notes: [] },
    });
    try {
      const nh = await generateNotHuman({
        conversations,
        owner,
        business: EMPTY_BUSINESS,
        uiLang: locale,
        onProgress: (progress) => setGen({ kind: "running", progress }),
      });
      try {
        await saveNotHuman(nh);
        remember({ nhId: nh.id });
      } catch {
        keepLocally(nh);
      }
      setGen({ kind: "done", nh });
    } catch (err) {
      const e = err instanceof GenerationError ? err : new GenerationError("generic", String(err));
      setGen({
        kind: "error",
        message:
          e.code === "generic"
            ? dict.generate.errors.generic(e.message)
            : e.code === "limit"
              ? dict.store.errors.limit(e.message)
              : dict.generate.errors[e.code],
      });
    }
  }

  function restart() {
    writeSaved({});
    setSaved({});
    setGen({ kind: "idle" });
    setJob(null);
    setEntries([]);
    setConsent(false);
    go(0);
  }

  const nh = gen.kind === "done" ? gen.nh : null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-32 pt-6 sm:px-10">
      <div ref={top} className="scroll-mt-6" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-acid">{t.eyebrow}</p>
        <h1 className="mt-4 font-serif text-[clamp(2.6rem,7vw,5.2rem)] leading-[0.92] tracking-tight">
          {t.titleA} <em className="text-acid">{t.titleB}</em>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/55">{t.intro}</p>
      </motion.div>

      <Stepper step={step} labels={t.steps} />
      {saved.nhId && step > 0 && (
        <p className="mt-3 font-mono text-[11px] text-white/35">
          <button onClick={restart} className="transition hover:text-rose">
            {t.restart}
          </button>
        </p>
      )}
      <GenPill gen={gen} visible={step > 0 && step < 3} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 40, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -40, filter: "blur(8px)" }}
          transition={{ duration: 0.5, ease }}
          className="mt-8"
        >
          {step === 0 && (
            <TalkStep
              entries={entries}
              setEntries={setEntries}
              guess={guess}
              owner={owner}
              onOwner={setPickedOwner}
              ready={!!owner && conversations.length > 0 && usableChats(chats).length > 0}
              consent={consent}
              onConsent={setConsent}
              onNext={() => {
                void generate();
                go(1);
              }}
            />
          )}
          {step === 1 && (
            <BusinessStep
              job={job}
              onJob={(j) => {
                setJob(j);
                remember({ jobId: j.id });
                go(2);
              }}
              onSkip={() => go(3)}
            />
          )}
          {step === 2 && <ProductsStep job={job} onNext={() => go(3)} />}
          {step === 3 && (
            <TryStep gen={gen} job={job} onRetry={() => void generate()} onRestart={restart} onNext={() => go(4)} />
          )}
          {step === 4 && nh && <WorkStep nh={nh} />}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

/** Los 5 pasos arriba, con el actual marcado (y una línea que avanza). */
function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="mt-10 grid grid-cols-5 gap-1.5">
      {labels.map((label, i) => (
        <li key={label} className="min-w-0">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-acid"
              initial={false}
              animate={{ width: i < step ? "100%" : i === step ? "50%" : "0%" }}
              transition={{ duration: 0.6, ease }}
            />
          </div>
          <p
            className={`mt-2 truncate font-mono text-[10px] uppercase tracking-[0.12em] sm:text-[11px] ${
              i === step ? "text-acid" : i < step ? "text-white/60" : "text-white/30"
            }`}
          >
            <span className="hidden sm:inline">{String(i + 1).padStart(2, "0")} · </span>
            {label}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Mientras se cuenta el negocio, una pastilla chica muestra que se está aprendiendo cómo escribe. */
function GenPill({ gen, visible }: { gen: Gen; visible: boolean }) {
  const { t: dict } = useI18n();
  const t = dict.start;
  const show = visible && gen.kind !== "idle";
  const pct =
    gen.kind === "running"
      ? gen.progress.phase === "extract"
        ? (gen.progress.blocksDone / Math.max(1, gen.progress.blocksTotal)) * 85
        : 92
      : 100;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={`mt-5 flex items-center gap-3 rounded-full border px-4 py-2 text-sm ${
            gen.kind === "error" ? "border-rose/30 bg-rose/[0.06] text-rose" : "border-acid/25 bg-acid/[0.06]"
          }`}
        >
          {gen.kind === "running" && (
            <span className="animate-morph size-4 shrink-0 bg-gradient-to-br from-acid to-emerald-400" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {gen.kind === "running" ? t.learning : gen.kind === "done" ? t.learned(gen.nh.name) : t.talk.failed}
          </span>
          {gen.kind === "running" && (
            <span className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-white/10">
              <motion.span className="block h-full bg-acid" animate={{ width: `${Math.max(6, pct)}%` }} />
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepHead({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-6">
      <p className="font-mono text-xs text-acid">{String(n).padStart(2, "0")}</p>
      <h2 className="mt-1 font-serif text-4xl leading-tight sm:text-5xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-white/55">{sub}</p>
    </div>
  );
}

function NextButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full bg-acid px-7 py-3.5 font-medium text-ink shadow-[0_20px_60px_-20px_rgba(198,255,61,0.7)] transition disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
    >
      {children}
    </motion.button>
  );
}

// --- 1. Cómo habla ----------------------------------------------------------------------------------------

function TalkStep(props: {
  entries: FileEntry[];
  setEntries: React.Dispatch<React.SetStateAction<FileEntry[]>>;
  guess: ReturnType<typeof detectOwner>;
  owner: string | null;
  onOwner: (name: string) => void;
  ready: boolean;
  consent: boolean;
  onConsent: (v: boolean) => void;
  onNext: () => void;
}) {
  const { t: dict } = useI18n();
  const t = dict.start.talk;
  const { entries, setEntries } = props;

  function add(files: ChatFile[]) {
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.key));
      const next = [...prev];
      for (const f of files) {
        const key = `${f.name}:${f.text.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ key, chat: parseExport(f.text, f.name) });
      }
      return next;
    });
  }

  async function onFiles(files: File[]) {
    for (const file of files) {
      try {
        add(await readChatFiles([file]));
      } catch {
        setEntries((prev) => [
          ...prev,
          { key: `${file.name}:error:${Date.now()}`, error: dict.create.openError, fileName: file.name },
        ]);
      }
    }
  }

  async function sample(set: SampleSet) {
    try {
      add(await loadSampleSet(set));
      props.onConsent(true);
    } catch {
      setEntries((prev) => [...prev, { key: `${set.id}:error`, error: dict.create.openError, fileName: set.id }]);
    }
  }

  return (
    <section>
      <StepHead n={1} title={t.title} sub={t.sub} />
      <div className="space-y-4">
        <Dropzone onFiles={onFiles} compact={entries.length > 0} />
        {entries.length ? (
          <FileList
            entries={entries}
            owner={props.owner}
            onRemove={(key) => setEntries((p) => p.filter((e) => e.key !== key))}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-mono text-sm text-white/45">{t.noChats}</span>
              {SAMPLE_SETS.map((set) => (
                <motion.button
                  key={set.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => sample(set)}
                  className="rounded-full border border-acid/30 px-4 py-2 text-sm text-acid transition hover:bg-acid hover:text-ink"
                >
                  {dict.create.samples[set.id]}
                </motion.button>
              ))}
            </div>
            <HowToExport />
          </div>
        )}
        <AnimatePresence>
          {entries.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={card}
            >
              <OwnerPicker guess={props.guess} owner={props.owner} onChange={props.onOwner} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-white/70">
        <input
          type="checkbox"
          checked={props.consent}
          onChange={(e) => props.onConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[#c6ff3d]"
        />
        {t.consent}
      </label>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <NextButton disabled={!props.ready || !props.consent} onClick={props.onNext}>
          {t.next}
        </NextButton>
        <p className="font-mono text-xs text-white/40">
          {!props.ready ? (entries.length ? t.needPairs : t.needChats) : t.keepOpen}
        </p>
      </div>
    </section>
  );
}

// --- 2. Tu negocio ---------------------------------------------------------------------------------------

function BusinessStep({ job, onJob, onSkip }: { job: Job | null; onJob: (j: Job) => void; onSkip: () => void }) {
  const { t: dict, locale } = useI18n();
  const t = dict.start.biz;
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<{ name: string; content: JobContent } | null>(null);
  const [busy, setBusy] = useState<"sort" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (job) {
    return (
      <section>
        <StepHead n={2} title={t.title} sub={t.have(job.name)} />
        <NextButton onClick={() => onJob(job)}>{dict.start.next}</NextButton>
      </section>
    );
  }

  async function sort() {
    setBusy("sort");
    setError(null);
    try {
      const r = await structureBrief(brief, locale);
      setResult({ name: r.name || t.defaultName, content: { ...r.content, brief } });
    } catch (err) {
      setError(storeErrorMessage(dict.store, err));
    }
    setBusy(null);
  }

  async function save() {
    if (!result) return;
    setBusy("save");
    setError(null);
    try {
      onJob(await createJob(result.name.trim() || t.defaultName, result.content));
    } catch (err) {
      setError(storeErrorMessage(dict.store, err));
      setBusy(null);
    }
  }

  const c = result?.content;
  return (
    <section>
      <StepHead n={2} title={t.title} sub={t.sub} />
      <div className="rounded-[32px] border border-acid/30 bg-acid/[0.05] p-5 sm:p-6">
        <label htmlFor="start-brief" className="sr-only">
          {t.title}
        </label>
        <textarea
          id="start-brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          maxLength={6000}
          placeholder={t.ph}
          className="w-full resize-y rounded-2xl border border-white/10 bg-ink/50 px-4 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-white/25 focus:border-acid/50"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <RecordButton lang={locale} onText={(text) => setBrief((b) => (b ? `${b}\n${text}` : text))} />
          <button
            type="button"
            disabled={brief.trim().length < 10 || !!busy}
            onClick={sort}
            className="rounded-full border border-acid/40 px-5 py-2.5 text-sm text-acid transition hover:bg-acid hover:text-ink disabled:opacity-40"
          >
            {busy === "sort" ? t.sorting : result ? t.resort : t.sort}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {result && c && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-4 ${card}`}
          >
            <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40" htmlFor="start-name">
              {t.nameLabel}
            </label>
            <input
              id="start-name"
              value={result.name}
              onChange={(e) => setResult({ ...result, name: e.target.value })}
              maxLength={120}
              className="mt-1 w-full bg-transparent font-serif text-4xl outline-none"
            />
            {(c.business.what || c.business.sells) && (
              <p className="mt-2 text-white/65">{[c.business.what, c.business.sells].filter(Boolean).join(" · ")}</p>
            )}
            <ul className="mt-4 grid gap-1.5 text-sm">
              {c.rules.slice(0, 6).map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    className={`shrink-0 font-mono text-[10px] uppercase ${
                      r.kind === "never" ? "text-rose" : r.kind === "always" ? "text-acid" : "text-white/40"
                    }`}
                  >
                    {dict.jobs.rules.kinds[r.kind]}
                  </span>
                  <span className="text-white/75">{r.text}</span>
                </li>
              ))}
              {c.rules.length > 6 && (
                <li className="font-mono text-[11px] text-white/35">{t.more(c.rules.length - 6)}</li>
              )}
            </ul>
            <p className="mt-4 font-mono text-[11px] text-white/45">{scheduleSummary(c.schedule.days, c.lang)}</p>
            <p className="mt-3 text-xs text-white/35">{t.editLater}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="mt-4 rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose">{error}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <NextButton disabled={!result || !!busy} onClick={save}>
          {busy === "save" ? t.saving : t.save}
        </NextButton>
        <button type="button" onClick={onSkip} className="text-sm text-white/45 transition hover:text-white">
          {t.skip}
        </button>
      </div>
    </section>
  );
}

// --- 3. Tus productos ------------------------------------------------------------------------------------

function ProductsStep({ job, onNext }: { job: Job | null; onNext: () => void }) {
  const t = useI18n().t.start;
  return (
    <section>
      <StepHead n={3} title={t.products.title} sub={t.products.sub} />
      {job ? <StockPanel jobId={job.id} /> : <p className={card}>{t.products.noJob}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <NextButton onClick={onNext}>{t.next}</NextButton>
        <p className="font-mono text-xs text-white/40">{t.products.optional}</p>
      </div>
    </section>
  );
}

// --- 4. Probalo -----------------------------------------------------------------------------------------

function TryStep({
  gen,
  job,
  onRetry,
  onRestart,
  onNext,
}: {
  gen: Gen;
  job: Job | null;
  onRetry: () => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  const { t: dict } = useI18n();
  const t = dict.start.try;
  const [assigned, setAssigned] = useState(false);
  const nh = gen.kind === "done" ? gen.nh : null;

  // Recién nacido: empieza a trabajar en el puesto (si hay) antes de la primera charla.
  useEffect(() => {
    if (!nh) return;
    if (!job || nh.jobId === job.id) return setAssigned(true);
    assignJob(nh.id, job.id)
      .catch(() => {})
      .finally(() => setAssigned(true));
  }, [nh, job]);

  return (
    <section>
      <StepHead n={4} title={t.title} sub={t.sub} />
      {gen.kind === "error" ? (
        <div className={card}>
          <p className="text-rose">{gen.message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <NextButton onClick={onRetry}>{t.retry}</NextButton>
            <button type="button" onClick={onRestart} className="text-sm text-white/50 hover:text-white">
              {t.back}
            </button>
          </div>
        </div>
      ) : !nh || !assigned ? (
        <Waiting gen={gen} />
      ) : (
        <>
          <TryChat nh={nh} job={job} />
          <div className="mt-6">
            <NextButton onClick={onNext}>{t.next}</NextButton>
          </div>
        </>
      )}
    </section>
  );
}

function Waiting({ gen }: { gen: Gen }) {
  const { t: dict } = useI18n();
  const progress = gen.kind === "running" ? gen.progress : null;
  const pct = progress
    ? progress.phase === "extract"
      ? (progress.blocksDone / Math.max(1, progress.blocksTotal)) * 85
      : 92
    : 4;
  return (
    <div className="overflow-hidden rounded-[32px] border border-acid/20 bg-gradient-to-br from-acid/[0.06] to-violet/[0.06] p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <div className="relative size-14 shrink-0">
          <div className="animate-morph absolute inset-0 bg-gradient-to-br from-acid to-emerald-400 opacity-90" />
          <div className="animate-morph absolute inset-0 bg-gradient-to-br from-violet to-rose opacity-60 mix-blend-screen [animation-delay:-3s]" />
        </div>
        <div>
          <p className="font-serif text-3xl">{dict.start.try.waiting}</p>
          {progress && (
            <p className="font-mono text-xs text-white/45">
              {dict.generate.phases[progress.phase]} · {progress.examples} {dict.generate.examples}
            </p>
          )}
        </div>
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-acid"
          animate={{ width: `${Math.max(4, pct)}%` }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </div>
      {progress && progress.notes.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {progress.notes.slice(-4).map((n) => (
            <motion.li
              key={n}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-sm text-white/70"
            >
              <span className="mr-2 text-acid">✦</span>
              {n}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Un chat compacto haciendo de cliente, con la misma mecánica que el test drive. */
function TryChat({ nh, job }: { nh: NotHuman; job: Job | null }) {
  const { t: dict } = useI18n();
  const t = dict.start.try;
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const conv = useConversation(
    async (turns) => {
      const reply = await sendChat(
        nh,
        turns,
        DEFAULT_MODEL_ID,
        job ? { id: job.id, name: job.name, content: job.content } : null,
      );
      return { messages: reply.messages };
    },
    (err) => {
      if (!(err instanceof GenerationError)) return t.error;
      if (err.code === "limit") return dict.store.errors.limit(err.message);
      return err.code === "generic" ? t.error : dict.generate.errors[err.code];
    },
  );
  const { turns, shown, typing, error } = conv;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, shown, typing]);

  function send(text: string) {
    if (!text.trim()) return;
    conv.send(text);
    setDraft("");
  }

  return (
    <div className="overflow-hidden rounded-[32px] border border-white/10 bg-ink/60">
      <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="animate-morph size-10 shrink-0 bg-gradient-to-br from-acid to-emerald-400" />
        <div className="min-w-0">
          <p className="truncate font-serif text-2xl leading-none">{nh.name}</p>
          <p className={`mt-1 font-mono text-[11px] ${typing ? "text-acid" : "text-white/40"}`}>
            {typing ? dict.public.typing : job ? t.worksAt(job.name) : dict.public.online}
          </p>
        </div>
      </header>
      <div ref={scroller} className="flex h-[min(420px,55dvh)] flex-col gap-1.5 overflow-y-auto px-4 py-5">
        {!turns.length && (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="text-sm text-white/45">{t.hint}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {t.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-white/75 transition hover:border-acid hover:text-acid"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn) => {
          const texts = turn.from === "nh" ? turn.texts.slice(0, shown[turn.id] ?? 0) : turn.texts;
          return texts.map((text, i) => (
            <div key={`${turn.id}-${i}`} className={`flex ${turn.from === "client" ? "justify-end" : "justify-start"}`}>
              <Bubble side={turn.from === "client" ? "right" : "left"}>{text}</Bubble>
            </div>
          ));
        })}
        {typing && (
          <div className="flex justify-start">
            <Dots />
          </div>
        )}
        {error && <p className="mt-2 text-center text-sm text-rose">{error}</p>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex gap-2 border-t border-white/10 p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.ph}
          aria-label={t.ph}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] outline-none placeholder:text-white/30 focus:border-acid/50"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-full bg-acid px-5 text-sm font-medium text-ink disabled:opacity-40"
        >
          {t.send}
        </button>
      </form>
    </div>
  );
}

// --- 5. A atender ---------------------------------------------------------------------------------------

function WorkStep({ nh }: { nh: NotHuman }) {
  const { t: dict } = useI18n();
  const t = dict.start.work;
  const me = useMe();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const whatsapp = can(me, "whatsapp");

  // Llegar acá es terminar el recorrido: la próxima vez arranca de cero.
  useEffect(() => writeSaved({}), []);

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const share = await createShare(nh.id);
      setUrl(`${window.location.origin}/c/${share.token}`);
    } catch (err) {
      setError(storeErrorMessage(dict.store, err));
    }
    setBusy(false);
  }

  const option = "flex flex-col rounded-[28px] border border-white/10 bg-white/[0.03] p-5";
  return (
    <section>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="mb-8 rounded-[32px] bg-acid px-6 py-5 text-ink sm:px-8"
      >
        <p className="font-serif text-3xl sm:text-4xl">{t.hired(nh.name)}</p>
      </motion.div>
      <StepHead n={5} title={t.title} sub={t.sub} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className={option}>
          <p className="font-serif text-2xl">{t.linkTitle}</p>
          <p className="mt-1 flex-1 text-sm text-white/55">{t.linkBody}</p>
          {url ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-ink/60 py-1.5 pl-3 pr-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-acid">{url}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  setCopied(true);
                }}
                className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 font-mono text-[11px] hover:bg-acid hover:text-ink"
              >
                {copied ? dict.jobs.stock.copied : dict.jobs.stock.copy}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={link}
              className="mt-4 rounded-full bg-acid px-5 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
            >
              {t.linkCta}
            </button>
          )}
          {error && <p className="mt-2 text-xs text-rose">{error}</p>}
        </div>
        <div className={option}>
          <p className="font-serif text-2xl">{t.whatsappTitle}</p>
          <p className="mt-1 flex-1 text-sm text-white/55">{t.whatsappBody}</p>
          {whatsapp ? (
            <Link
              href="/app/whatsapp"
              className="mt-4 rounded-full border border-white/15 px-5 py-2.5 text-center text-sm transition hover:border-acid hover:text-acid"
            >
              {t.whatsappCta}
            </Link>
          ) : (
            <Link
              href="/app/pricing"
              className="mt-4 rounded-full border border-white/10 px-5 py-2.5 text-center text-sm text-white/45 hover:text-acid"
            >
              {t.locked}
            </Link>
          )}
        </div>
        <div className={option}>
          <p className="font-serif text-2xl">{t.appTitle}</p>
          <p className="mt-1 flex-1 text-sm text-white/55">{t.appBody}</p>
          <Link
            href={`/app/explore?nh=${nh.id}`}
            className="mt-4 rounded-full border border-white/15 px-5 py-2.5 text-center text-sm transition hover:border-acid hover:text-acid"
          >
            {t.appCta}
          </Link>
        </div>
      </div>
    </section>
  );
}
