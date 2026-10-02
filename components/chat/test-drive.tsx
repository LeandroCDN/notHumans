"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODEL_ID, MODELS, findModel } from "@/lib/llm/models";
import { type ChatReply, type ChatTurn, formatCost, sendChat } from "@/lib/nothuman/chat";
import { GenerationError } from "@/lib/nothuman/generate";
import type { NotHuman } from "@/lib/nothuman/schema";
import { findLeak } from "@/lib/nothuman/pipeline";
import { StoreError, refreshNotHumans, saveCorrections, useNotHumans } from "@/lib/nothuman/store";
import { useI18n } from "../i18n";
import { WithPlaceholders } from "../nothuman/profile-view";
import { StoreErrorNotice, storeErrorMessage } from "../nothuman/store-ui";

const HUES = ["from-acid to-emerald-400", "from-violet to-rose", "from-rose to-amber-300", "from-sky-400 to-violet"];

/** Cuánto espera el notHuman por si el cliente manda varios mensajes seguidos, como en WhatsApp. */
const DEBOUNCE_MS = 1300;

/** `original`: lo que había dicho el notHuman antes de que lo corrijan. `saved`: la corrección ya está en una versión. */
type Turn = ChatTurn & { id: number; meta?: ChatReply; original?: string[]; saved?: boolean };

export function TestDrive({ initialId }: { initialId?: string }) {
  const { t: dict } = useI18n();
  const t = dict.chat;
  const { list, error, reload } = useNotHumans();

  if (list === null) return null;
  if (error && list.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 pt-16 sm:px-10">
        <StoreErrorNotice error={error} reload={reload} />
      </main>
    );
  }
  if (list.length === 0) {
    return (
      <main className="mx-auto flex min-h-[80dvh] max-w-4xl flex-col justify-center px-4 sm:px-10">
        <Link href="/app" className="font-mono text-xs text-white/40 transition hover:text-acid">
          {dict.common.back}
        </Link>
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-acid">{t.eyebrow}</p>
        <h1 className="mt-4 font-serif text-[clamp(2.8rem,8vw,6.5rem)] leading-[0.9] tracking-tight">
          {t.noneTitle} <em className="text-acid">{t.noneAccent}</em>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-white/55">{t.noneBody}</p>
        <Link
          href="/app/new"
          className="mt-10 inline-flex self-start rounded-full bg-acid px-6 py-3 font-medium text-ink transition hover:scale-[1.03]"
        >
          {t.createCta}
        </Link>
      </main>
    );
  }

  const nh = list.find((x) => x.id === initialId) ?? list[0];
  // El key reinicia la conversación al cambiar de notHuman.
  return <Drive key={nh.id} nh={nh} list={list} />;
}

function Drive({ nh, list }: { nh: NotHuman; list: NotHuman[] }) {
  const { t: dict } = useI18n();
  const t = dict.chat;
  const router = useRouter();
  const hue = HUES[Math.max(0, list.indexOf(nh)) % HUES.length];

  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [turns, setTurns] = useState<Turn[]>([]);
  // Cuántos mensajes de cada respuesta ya "llegaron" (se muestran de a uno, como alguien tipeando).
  const [shown, setShown] = useState<Record<number, number>>({});
  const [status, setStatus] = useState<"idle" | "waiting" | "thinking">("idle");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>(null);

  const turnsRef = useRef<Turn[]>([]);
  const modelRef = useRef(modelId);
  const busy = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  modelRef.current = modelId;

  function update(next: Turn[]) {
    turnsRef.current = next;
    setTurns(next);
  }

  useEffect(() => {
    // Foco directo solo con mouse: en el celu abriría el teclado tapando todo.
    if (matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
    return () => void (timer.current && clearTimeout(timer.current));
  }, []);

  // Siempre abajo de todo, como un chat.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, shown, status]);

  async function respond() {
    if (busy.current) {
      again.current = true;
      return;
    }
    const snapshot = turnsRef.current;
    if (snapshot.at(-1)?.from !== "client") return;
    busy.current = true;
    setStatus("thinking");
    setError(null);
    try {
      const reply = await sendChat(
        nh,
        snapshot.map(({ from, texts }) => ({ from, texts })),
        modelRef.current,
      );
      // Si mientras tanto se reinició la conversación, la respuesta ya no corresponde.
      const asked = snapshot[snapshot.length - 1];
      const current = turnsRef.current;
      const at = current.findIndex((x) => x.id === asked.id);
      if (at === -1) return;
      // Lo que el cliente escribió mientras esperaba queda después de la respuesta (y dispara otra).
      const later = current[at].texts.slice(asked.texts.length);
      const id = nextId.current++;
      update([
        ...current.slice(0, at),
        { ...current[at], texts: asked.texts },
        { id, from: "nh", texts: reply.messages, meta: reply },
        ...(later.length ? [{ id: nextId.current++, from: "client" as const, texts: later }] : []),
      ]);
      await reveal(id, reply.messages);
    } catch (err) {
      const e = err instanceof GenerationError ? err : new GenerationError("generic", String(err));
      const errors = dict.generate.errors;
      setError(e.code === "generic" ? errors.generic(e.message) : errors[e.code]);
    } finally {
      busy.current = false;
      setStatus("idle");
      if (again.current) {
        again.current = false;
        void respond();
      }
    }
  }

  async function reveal(id: number, messages: string[]) {
    for (let i = 0; i < messages.length; i++) {
      // Un poco más de espera para los mensajes largos, sin pasarse.
      if (i > 0) await new Promise((r) => setTimeout(r, Math.min(1600, 450 + messages[i].length * 22)));
      setShown((s) => ({ ...s, [id]: i + 1 }));
    }
  }

  function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const current = turnsRef.current;
    const last = current.at(-1);
    update(
      last?.from === "client"
        ? [...current.slice(0, -1), { ...last, texts: [...last.texts, clean] }]
        : [...current, { id: nextId.current++, from: "client", texts: [clean] }],
    );
    setDraft("");
    if (!busy.current) setStatus("waiting");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void respond(), DEBOUNCE_MS);
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    again.current = false;
    update([]);
    setShown({});
    setError(null);
    setStatus("idle");
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

  // Avisar antes de irse con correcciones sin guardar.
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

  const revealing = turns.some((x) => x.from === "nh" && (shown[x.id] ?? 0) < x.texts.length);
  const typing = status === "thinking" || revealing;
  const nf = (n: number) => n.toLocaleString(dict.intl);
  const cacheRate = totals.input ? totals.cached / totals.input : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-10">
      <Link href={`/app/n/${nh.id}`} className="font-mono text-xs text-white/40 transition hover:text-acid">
        {dict.common.back}
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-acid">{t.eyebrow}</p>
        <h1 className="mt-3 font-serif text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.9] tracking-tight">
          {t.title} <em className="text-acid">{nh.name}</em>
        </h1>
        <p className="mt-3 max-w-2xl text-white/55">{t.sub}</p>
      </motion.div>

      <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <Picker label={t.who}>
          {list.map((x, i) => (
            <Pill key={x.id} group="nh" active={x.id === nh.id} onClick={() => router.replace(`/app/chat?nh=${x.id}`)}>
              <span className={`animate-morph size-4 shrink-0 bg-gradient-to-br ${HUES[i % HUES.length]}`} />
              {x.name}
            </Pill>
          ))}
        </Picker>
        <Picker label={t.model}>
          {MODELS.map((m) => (
            <Pill key={m.id} group="model" active={m.id === modelId} onClick={() => setModelId(m.id)}>
              {m.label}
              <span className="font-mono text-[10px] opacity-50">${m.price.cacheMiss}/M</span>
            </Pill>
          ))}
        </Picker>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* El teléfono */}
        <section className="flex h-[min(72dvh,720px)] min-h-[460px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <header className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5">
            <div className={`animate-morph size-10 shrink-0 bg-gradient-to-br ${hue}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">{nh.name}</p>
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
            </div>
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
                <button onClick={() => void respond()} className="rounded-full border border-rose/40 px-3 py-1 text-xs">
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

        {/* Lo que cuesta */}
        <aside className="flex flex-col gap-3">
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
        </aside>
      </div>
    </main>
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

function Bubble({ side, corrected, children }: { side: "left" | "right"; corrected?: boolean; children: React.ReactNode }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.6, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      style={{ originX: side === "left" ? 0 : 1, originY: 1 }}
      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
        side === "right"
          ? "rounded-br-md bg-white/[0.09]"
          : `rounded-bl-md bg-acid text-ink ${corrected ? "ring-2 ring-violet ring-offset-2 ring-offset-ink" : ""}`
      }`}
    >
      {children}
    </motion.span>
  );
}

function Dots() {
  return (
    <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.07] px-3.5 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-acid"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

type PillProps = { group: string; active: boolean; onClick: () => void; children: React.ReactNode };

function Pill({ group, active, onClick, children }: PillProps) {
  return (
    <button
      onClick={onClick}
      className={`relative isolate flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${
        active ? "border-acid text-ink" : "border-white/15 text-white/70 hover:border-white/35"
      }`}
    >
      {active && (
        <motion.span
          layoutId={`pill-${group}`}
          className="absolute inset-0 -z-10 rounded-full bg-acid"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      {children}
    </button>
  );
}
