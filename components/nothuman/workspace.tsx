"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODEL_ID, MODELS, findModel } from "@/lib/llm/models";
import { type ChatReply, formatCost, sendChat } from "@/lib/nothuman/chat";
import { GenerationError } from "@/lib/nothuman/generate";
import type { NotHuman } from "@/lib/nothuman/schema";
import { findLeak } from "@/lib/nothuman/pipeline";
import { StoreError, refreshNotHumans, saveCorrections } from "@/lib/nothuman/store";
import { Bubble, Dots } from "../chat/bubbles";
import { type ConvTurn, useConversation } from "../chat/use-conversation";
import { useI18n } from "../i18n";
import { useJobs } from "@/lib/job/store";
import { JobTab } from "../job/job-tab";
import { ProfileSide } from "./profile-side";
import { WithPlaceholders } from "./profile-view";
import { can, useMe } from "@/lib/me";
import { ShareButton } from "./share-link";
import { storeErrorMessage } from "./store-ui";

// El espacio de trabajo de un notHuman: el chat en el centro y un panel con pestañas al costado
// (Chat: costo y correcciones · Perfil: quién es, versiones, link · Puesto: dónde trabaja).

type Turn = ConvTurn<ChatReply>;

export type HubTab = "chat" | "profile" | "job";
export const HUB_TABS: HubTab[] = ["chat", "profile", "job"];

type Props = {
  nh: NotHuman;
  /** Gradiente del avatar (clases de Tailwind). */
  hue: string;
  tab: HubTab;
  onTab: (tab: HubTab) => void;
  /** Hay correcciones sin guardar. */
  onDirty: (dirty: boolean) => void;
};

export function Workspace({ nh, hue, tab, onTab, onDirty }: Props) {
  const { t: dict } = useI18n();
  const t = dict.chat;
  const th = dict.hub;
  const { jobs } = useJobs();
  const job = jobs?.find((j) => j.id === nh.jobId) ?? null;

  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const me = useMe();
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const conv = useConversation<ChatReply>(
    async (turns) => {
      const reply = await sendChat(nh, turns, modelId, job ? { name: job.name, content: job.content } : null);
      return { messages: reply.messages, meta: reply };
    },
    (err) => {
      const e = err instanceof GenerationError ? err : new GenerationError("generic", String(err));
      const errors = dict.generate.errors;
      if (e.code === "limit") return dict.store.errors.limit(e.message);
      return e.code === "generic" ? errors.generic(e.message) : errors[e.code];
    },
  );
  const { turns, turnsRef, shown, setShown, status, error, typing, revealing, update } = conv;

  useEffect(() => {
    // Foco directo solo con mouse: en el celu abriría el teclado tapando todo.
    if (matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, []);

  // Siempre abajo de todo, como un chat.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, shown, status]);

  function send(text: string) {
    if (!text.trim()) return;
    conv.send(text);
    setDraft("");
  }

  function reset() {
    conv.reset();
    input.current?.focus();
  }

  // --- Correcciones ---------------------------------------------------------------------------

  /** Lo que dijo el cliente justo antes de una respuesta: es el contexto del ejemplo corregido. */
  function contextOf(turnId: number): string {
    const all = turnsRef.current;
    const at = all.findIndex((x) => x.id === turnId);
    const client = all.slice(0, at).findLast((x) => x.from === "client");
    return client?.texts.join("\n") ?? "";
  }

  /** Aplica una corrección a la charla. Devuelve un error si se coló un dato real. */
  function correct(turnId: number, texts: string[]): string | null {
    const leak = findLeak({ intent: "other", context: "", reply: texts });
    if (leak) return dict.store.errors.leak(leak);
    const all = turnsRef.current;
    update(
      all.map((x) => {
        if (x.id !== turnId) return x;
        const original = x.original ?? x.texts;
        // Si quedó igual que lo que había dicho, no es una corrección.
        if (original.join("\n") === texts.join("\n")) return { ...x, texts: original, original: undefined, saved: undefined };
        return { ...x, texts, original, saved: false };
      }),
    );
    setShown((s) => ({ ...s, [turnId]: texts.length }));
    setSaveState(null);
    return null;
  }

  const pending = turns.filter((x) => x.original && !x.saved);

  async function saveVersion() {
    if (!pending.length) return;
    setSaveState({ kind: "saving" });
    try {
      const corrections = pending.map((x) => ({ intent: "other" as const, context: contextOf(x.id), reply: x.texts }));
      const next = await saveCorrections(nh.id, nh.version, corrections);
      const ids = new Set(pending.map((x) => x.id));
      update(turnsRef.current.map((x) => (ids.has(x.id) ? { ...x, saved: true } : x)));
      setSaveState({ kind: "saved", version: next.version });
    } catch (err) {
      const conflict = err instanceof StoreError && err.code === "conflict";
      setSaveState({ kind: "error", message: storeErrorMessage(dict.store, err), conflict });
    }
  }

  // Avisarle a la vista de afuera (para no cambiar de notHuman sin querer) y antes de cerrar la pestaña.
  useEffect(() => {
    onDirty(pending.length > 0);
  }, [pending.length, onDirty]);
  useEffect(() => {
    if (!pending.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending.length]);

  const totals = useMemo(() => {
    const replies = turns.filter((x) => x.meta).map((x) => x.meta!);
    const sum = (f: (r: ChatReply) => number) => replies.reduce((n, r) => n + f(r), 0);
    return {
      replies: replies.length,
      input: sum((r) => r.usage.input),
      cached: sum((r) => r.usage.cacheHit),
      output: sum((r) => r.usage.output),
      cost: sum((r) => r.cost),
    };
  }, [turns]);

  const nf = (n: number) => n.toLocaleString(dict.intl);
  const cacheRate = totals.input ? totals.cached / totals.input : 0;


  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row xl:items-start">
        <section className="flex h-[min(80dvh,760px)] min-h-[460px] min-w-0 flex-1 flex-col rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <header className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 px-5 py-3.5">
            <div className={`animate-morph size-10 shrink-0 bg-gradient-to-br ${hue}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-2xl leading-none">{nh.name}</p>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <AnimatePresence mode="wait">
                <motion.p
                  key={typing ? "typing" : status}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={`font-mono text-[11px] ${typing ? "text-acid" : "text-white/40"}`}
                >
                  {typing ? t.typing : status === "waiting" ? t.waiting : t.online}
                </motion.p>
              </AnimatePresence>
              {job && (
                <button
                  onClick={() => onTab("job")}
                  className="min-w-0 truncate rounded-full border border-acid/35 px-2 py-px font-mono text-[10px] text-acid transition hover:bg-acid/10"
                >
                  {dict.jobs.chip(job.name)}
                </button>
              )}
              </div>
            </div>
            <label className="sr-only" htmlFor="nh-model">
              {t.model}
            </label>
            <select
              id="nh-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="max-w-36 cursor-pointer rounded-full border border-white/10 bg-transparent px-3 py-1.5 font-mono text-[11px] text-white/70 outline-none transition hover:border-white/30 focus:border-acid/60"
            >
              {MODELS.map((m) => {
                // V4 Pro es de Business: se ve, pero con candado.
                const locked = m.model !== findModel(undefined).model && !can(me, "proModel");
                return (
                  <option key={m.id} value={m.id} disabled={locked} className="bg-ink">
                    {m.label} · ${m.price.cacheMiss}/M{locked ? ` · ${dict.account.gate.locked}` : ""}
                  </option>
                );
              })}
            </select>
            <ShareButton id={nh.id} />
            {turns.length > 0 && (
              <button
                onClick={reset}
                className="rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] text-white/50 transition hover:border-rose/40 hover:text-rose"
              >
                {t.reset}
              </button>
            )}
          </header>

          <div ref={scroller} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-5 sm:px-6">
            {turns.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="m-auto flex max-w-md flex-col items-center gap-5 text-center"
              >
                <div className={`animate-morph size-20 bg-gradient-to-br ${hue} opacity-90`} />
                <p className="text-white/55">{t.empty(nh.name)}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {t.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm transition hover:border-acid hover:text-acid"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {turns.map((turn) =>
              turn.from === "client" ? (
                <div key={turn.id} className="mt-2 flex flex-col items-end gap-1.5">
                  {turn.texts.map((text, i) => (
                    <Bubble key={i} side="right">
                      {text}
                    </Bubble>
                  ))}
                </div>
              ) : (
                <NhTurn
                  key={turn.id}
                  turn={turn}
                  shown={shown[turn.id] ?? 0}
                  owner={nh.owner}
                  onCorrect={(texts) => correct(turn.id, texts)}
                />
              ),
            )}

            <AnimatePresence>
              {typing && !revealing && (
                <motion.div
                  key="dots"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="mt-2 self-start"
                >
                  <Dots />
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex flex-wrap items-center gap-3 self-stretch rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose"
              >
                <span className="flex-1">{error}</span>
                <button onClick={conv.retry} className="rounded-full border border-rose/40 px-3 py-1 text-xs">
                  {dict.generate.retry}
                </button>
              </motion.div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 border-t border-white/10 p-3"
          >
            <textarea
              ref={input}
              value={draft}
              rows={1}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder={t.placeholder}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] outline-none transition placeholder:text-white/30 focus:border-acid/50"
            />
            <motion.button
              type="submit"
              whileTap={{ scale: 0.9 }}
              disabled={!draft.trim()}
              aria-label={t.send}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-acid text-lg text-ink transition disabled:opacity-30"
            >
              ↑
            </motion.button>
          </form>
        </section>

      <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-[340px]">
        <div role="tablist" aria-label={th.panel} className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
          {HUB_TABS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTab(id)}
              className={`relative isolate flex-1 rounded-full py-2 text-sm transition ${
                tab === id ? "text-ink" : "text-white/60 hover:text-white"
              }`}
            >
              {tab === id && (
                <motion.span
                  layoutId="hub-tab"
                  className="absolute inset-0 -z-10 rounded-full bg-bone"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              {th.tabs[id]}
              {id === "chat" && pending.length > 0 && (
                <span className="ml-1.5 inline-block size-1.5 rounded-full bg-violet align-middle" />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3"
          >
            {tab === "chat" && (
              <>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{t.totals}</p>
                  <motion.p
                    key={totals.cost}
                    initial={{ opacity: 0.4, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 font-serif text-5xl leading-none text-acid"
                  >
                    {formatCost(totals.cost)}
                  </motion.p>
                  <p className="mt-1 font-mono text-[11px] text-white/40">{t.turns(totals.replies)}</p>

                  <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                    {[
                      [t.input, totals.input],
                      [t.cached, totals.cached],
                      [t.output, totals.output],
                    ].map(([label, n]) => (
                      <div key={label} className="rounded-2xl bg-white/[0.04] px-2 py-2.5">
                        <dd className="font-mono text-sm">{nf(n as number)}</dd>
                        <dt className="mt-0.5 font-mono text-[10px] text-white/40">{label}</dt>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-5">
                    <div className="flex justify-between font-mono text-[11px] text-white/45">
                      <span>{t.cacheRate}</span>
                      <span>{Math.round(cacheRate * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-violet"
                        animate={{ width: `${cacheRate * 100}%` }}
                        transition={{ type: "spring", stiffness: 60, damping: 18 }}
                      />
                    </div>
                  </div>
                </div>
                <Corrections
                  name={nh.name}
                  version={nh.version}
                  pending={pending.length}
                  state={saveState}
                  onSave={() => void saveVersion()}
                  onReload={() => {
                    refreshNotHumans();
                    setSaveState(null);
                  }}
                />
                <p className="px-2 font-mono text-[10px] leading-relaxed text-white/30">{t.priceNote}</p>
                <p className="px-2 text-xs leading-relaxed text-white/40">{t.placeholderHint}</p>
              </>
            )}
            {tab === "profile" && <ProfileSide nh={nh} />}
            {tab === "job" && <JobTab nh={nh} />}
          </motion.div>
        </AnimatePresence>
      </aside>
    </div>
  );
}

type NhTurnProps = { turn: Turn; shown: number; owner: string; onCorrect: (texts: string[]) => string | null };

function NhTurn({ turn, shown, owner, onCorrect }: NhTurnProps) {
  const { t: dict } = useI18n();
  const t = dict.chat;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const meta = turn.meta;
  const done = shown >= turn.texts.length;
  const nf = (n: number) => n.toLocaleString(dict.intl);

  if (editing) {
    return (
      <CorrectionEditor
        owner={owner}
        initial={turn.texts}
        onCancel={() => setEditing(false)}
        onSave={(texts) => {
          const error = onCorrect(texts);
          if (!error) setEditing(false);
          return error;
        }}
      />
    );
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <AnimatePresence>
        {showOriginal &&
          turn.original?.map((text, i) => (
            <motion.span
              key={`o${i}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-white/10 px-3.5 py-2 text-[15px] leading-snug text-white/40 line-through decoration-rose/60"
            >
              {text}
            </motion.span>
          ))}
      </AnimatePresence>
      {turn.texts.slice(0, shown).map((text, i) => (
        <Bubble key={`${turn.original ? "c" : "o"}${i}`} side="left" corrected={!!turn.original}>
          <WithPlaceholders text={text} onAcid />
        </Bubble>
      ))}
      {!done && shown > 0 && <Dots />}
      {done && turn.original && (
        <div className="flex items-center gap-3 pl-1 font-mono text-[10px]">
          <span className={turn.saved ? "text-acid" : "text-violet-300"}>✎ {turn.saved ? t.correctedSaved : t.corrected}</span>
          <button onClick={() => setShowOriginal(!showOriginal)} className="text-white/40 transition hover:text-white/70">
            {showOriginal ? t.hideOriginal : t.showOriginal}
          </button>
        </div>
      )}
      {meta && done && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 font-mono text-[10px] text-white/35"
        >
          <span>
            {findModel(meta.modelId).label} · {t.perTurn((meta.ms / 1000).toFixed(1), nf(meta.usage.input), nf(meta.usage.cacheHit), nf(meta.usage.output), formatCost(meta.cost))}
          </span>
          {meta.used && meta.used.length > 0 && (
            <span className="flex flex-wrap items-center gap-1 text-acid/70">
              {dict.jobs.used}
              {meta.used.map((u) => (
                <span key={u} className="rounded-full border border-acid/25 px-2 py-0.5">
                  {u}
                </span>
              ))}
            </span>
          )}
          {meta.reasoning && (
            <button onClick={() => setOpen(!open)} className="text-violet-300 transition hover:text-violet-200">
              {open ? t.hideThinking : t.showThinking}
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="rounded-full border border-white/10 px-2 py-0.5 text-white/50 transition hover:border-violet/50 hover:text-violet-200"
          >
            {t.correct}
          </button>
        </motion.div>
      )}
      <AnimatePresence>
        {open && meta?.reasoning && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-[85%] overflow-hidden whitespace-pre-wrap rounded-2xl border border-violet/25 bg-violet/[0.06] px-3.5 py-2 text-xs leading-relaxed text-white/60"
          >
            {meta.reasoning}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Para reescribir una respuesta como la diría la persona. Una línea por mensaje de WhatsApp. */
function CorrectionEditor(props: {
  owner: string;
  initial: string[];
  onCancel: () => void;
  onSave: (texts: string[]) => string | null;
}) {
  const t = useI18n().t.chat;
  const [value, setValue] = useState(props.initial.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const texts = value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  function save() {
    if (texts.length) setError(props.onSave(texts));
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="mt-2 w-full max-w-[min(85%,520px)] self-start rounded-3xl border border-violet/40 bg-violet/[0.08] p-3"
    >
      <p className="px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-violet-200">{t.correctTitle(props.owner)}</p>
      <textarea
        autoFocus
        value={value}
        rows={Math.min(8, Math.max(2, value.split("\n").length))}
        maxLength={2000}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") props.onCancel();
        }}
        className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-ink/60 px-3.5 py-2.5 text-[15px] leading-snug outline-none focus:border-violet/60"
      />
      <p className="px-1 text-[11px] leading-relaxed text-white/40">{t.correctHint}</p>
      {error && <p className="mt-1 px-1 text-xs text-rose">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={props.onCancel} className="rounded-full px-3 py-1.5 text-sm text-white/50 transition hover:text-white">
          {t.cancel}
        </button>
        <button
          onClick={save}
          disabled={!texts.length}
          className="rounded-full bg-violet px-4 py-1.5 text-sm font-medium text-white transition hover:scale-[1.03] disabled:opacity-40"
        >
          {t.correctSave}
        </button>
      </div>
    </motion.div>
  );
}

type SaveState =
  | { kind: "saving" }
  | { kind: "saved"; version: number }
  | { kind: "error"; message: string; conflict: boolean }
  | null;

/** Tarjeta del costado: correcciones pendientes y el botón para guardarlas como versión nueva. */
function Corrections(props: {
  name: string;
  version: number;
  pending: number;
  state: SaveState;
  onSave: () => void;
  onReload: () => void;
}) {
  const t = useI18n().t.chat;
  const { state } = props;
  return (
    <motion.div
      layout
      className={`rounded-[28px] border p-5 transition-colors ${
        props.pending ? "border-violet/40 bg-violet/[0.07]" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{t.corrections}</p>
        <span className="font-mono text-[11px] text-white/40">v{props.version}</span>
      </div>
      {props.pending > 0 ? (
        <>
          <p className="mt-2 font-serif text-3xl leading-tight text-violet-200">{t.pending(props.pending)}</p>
          <button
            onClick={props.onSave}
            disabled={state?.kind === "saving"}
            className="mt-4 w-full rounded-full bg-violet px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_40px_-10px_rgba(139,92,246,0.8)] transition hover:scale-[1.02] disabled:opacity-50"
          >
            {state?.kind === "saving" ? t.saving : t.saveVersion(props.version + 1)}
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-white/50">{t.correctionsHint(props.name)}</p>
      )}
      <AnimatePresence>
        {state?.kind === "saved" && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-sm text-acid"
          >
            ✓ {t.savedAs(state.version)}
          </motion.p>
        )}
        {state?.kind === "error" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-sm text-rose">
            {state.message}
            {state.conflict && (
              <button onClick={props.onReload} className="ml-2 underline underline-offset-2">
                {t.reload}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
