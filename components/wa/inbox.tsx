"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  approveDraft,
  askSuggestion,
  discardDraft,
  sendManual,
  setStatus,
  useConversation,
  useConversations,
} from "@/lib/wa/client";
import { type Channel, type Conversation, type WaMessage, windowOpen } from "@/lib/wa/types";
import { Avatar } from "../account/avatar";
import { useI18n } from "../i18n";

// La bandeja: charlas a la izquierda, la conversación en el centro. Los borradores del notHuman aparecen como
// burbujas punteadas para aprobar, corregir o descartar. En el celu se ve una cosa por vez.

export function Inbox({
  channel,
  conversationId,
  onOpen,
}: {
  channel: Channel;
  conversationId?: string;
  onOpen: (id: string | undefined) => void;
}) {
  const t = useI18n().t.wa;
  const { items } = useConversations(channel.id);
  if (items === null) return null;
  const current = items.find((c) => c.id === conversationId) ?? null;

  return (
    <section className="mt-4 grid min-h-[320px] overflow-hidden lg:min-h-[560px] rounded-[28px] border border-white/10 bg-[#0e0e10]/80 lg:grid-cols-[320px_1fr]">
      <aside className={`border-white/10 lg:border-r ${current ? "hidden lg:block" : ""}`}>
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <motion.span
              className="text-4xl"
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }}
            >
              💬
            </motion.span>
            <p className="font-serif text-2xl">{t.inbox.empty}</p>
            <p className="max-w-xs text-sm text-white/45">{t.inbox.emptyHint}</p>
          </div>
        ) : (
          <ul className="max-h-[70vh] overflow-y-auto p-2">
            {items.map((c, i) => (
              <ConversationRow key={c.id} c={c} active={c.id === current?.id} index={i} onClick={() => onOpen(c.id)} />
            ))}
          </ul>
        )}
      </aside>
      <div className={current ? "" : "hidden lg:block"}>
        {current ? (
          <Thread key={current.id} conversation={current} onBack={() => onOpen(undefined)} />
        ) : (
          <p className="flex h-full items-center justify-center p-10 font-serif text-2xl text-white/35">{t.inbox.pick}</p>
        )}
      </div>
    </section>
  );
}

function ConversationRow({ c, active, index, onClick }: { c: Conversation; active: boolean; index: number; onClick: () => void }) {
  const { t, locale } = useI18n();
  const name = c.customerName || `+${c.customerWaId}`;
  const time = new Date(c.lastMessageAt).toLocaleTimeString(locale === "es" ? "es-AR" : "en-US", { hour: "2-digit", minute: "2-digit" });
  return (
    <motion.li layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index, 10) * 0.03 }}>
      <button
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
          active ? "bg-emerald-400/[0.08]" : "hover:bg-white/[0.04]"
        }`}
      >
        <Avatar name={name} url={null} size="size-10" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{name}</span>
            <span className="shrink-0 font-mono text-[10px] text-white/35">{time}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-sm text-white/45">{c.preview}</span>
            {c.status === "human" && (
              <span className="shrink-0 rounded-full border border-violet/50 px-1.5 font-mono text-[9px] text-violet-200">{t.wa.inbox.human}</span>
            )}
            {c.pending > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-auto shrink-0 rounded-full bg-acid px-2 py-0.5 font-mono text-[10px] font-medium text-ink"
              >
                {t.wa.inbox.drafts(c.pending)}
              </motion.span>
            )}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

/** La conversación con un cliente. */
function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { t: dict } = useI18n();
  const t = dict.wa;
  const { data, reload } = useConversation(conversation.id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const conv = data?.conversation ?? conversation;
  const messages = data?.messages ?? [];
  const open = windowOpen(conv);
  // Solo tiene sentido sugerir si lo último que quedó en la charla lo escribió el cliente.
  const lastReal = messages.filter((m) => m.status === "received" || m.status === "sent").at(-1);
  const canSuggest = open && lastReal?.direction === "in";
  const name = conv.customerName || `+${conv.customerWaId}`;

  // Bajar al último mensaje cuando llega algo nuevo.
  const count = messages.length;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count]);
  // "Pensando…" hasta que aparezca el borrador pedido.
  const drafts = messages.filter((m) => m.status === "draft").length;
  useEffect(() => {
    if (drafts > 0) setThinking(false);
  }, [drafts]);

  function explain(err: unknown): string {
    const code = (err as Error).message;
    const known = t.errors[code];
    if (typeof known === "string") return known;
    if (code.startsWith("limit:")) return dict.store.errors.limit(code.slice(6));
    return (t.errors.generic as (d: string) => string)(code);
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(explain(err));
    }
    setBusy(null);
  }

  return (
    <div className="flex h-full max-h-[75vh] min-h-[560px] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <button onClick={onBack} className="font-mono text-xs text-white/45 hover:text-white lg:hidden">
          {t.inbox.back}
        </button>
        <Avatar name={name} url={null} size="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="font-mono text-[10px] text-white/40">+{conv.customerWaId}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${conv.status === "bot" ? "bg-acid/15 text-acid" : "bg-violet/20 text-violet-200"}`}>
          {conv.status === "bot" ? t.chat.bot : t.chat.human}
        </span>
        <button
          disabled={busy !== null}
          onClick={() => void run("status", () => setStatus(conv.id, conv.status === "bot" ? "human" : "bot"))}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs transition hover:border-acid hover:text-acid disabled:opacity-50"
        >
          {conv.status === "bot" ? t.chat.take : t.chat.giveBack}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageView key={m.id} m={m} busy={busy} run={run} />
          ))}
        </AnimatePresence>
        {thinking && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }} className="text-right font-mono text-xs text-acid">
            {t.chat.thinking}
          </motion.p>
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-white/10 p-3">
        {!open && <p className="mb-2 rounded-xl bg-amber-300/10 px-3 py-2 text-xs text-amber-200">{t.chat.windowClosed}</p>}
        {error && <p className="mb-2 text-xs text-rose">{error}</p>}
        <div className="mb-2 flex justify-end">
          <button
            disabled={!canSuggest || busy !== null || thinking}
            onClick={() => {
              setThinking(true);
              void run("suggest", () => askSuggestion(conv.id)).finally(() => setTimeout(() => setThinking(false), 15000));
            }}
            className="rounded-full border border-acid/40 px-3 py-1.5 text-xs text-acid transition hover:bg-acid hover:text-ink disabled:opacity-40"
          >
            {t.chat.suggest}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const body = text;
            setText("");
            void run("manual", () => sendManual(conv.id, body));
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            disabled={!open}
            placeholder={t.chat.placeholder}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[15px] outline-none transition placeholder:text-white/25 focus:border-violet/60 disabled:opacity-40"
          />
          <button
            disabled={!open || !text.trim() || busy !== null}
            className="h-11 rounded-full bg-violet px-5 text-sm font-medium text-white transition hover:scale-[1.03] disabled:opacity-40"
          >
            {t.chat.sendManual}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageView({
  m,
  busy,
  run,
}: {
  m: WaMessage;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { t: dict, locale } = useI18n();
  const t = dict.wa;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.texts.join("\n"));
  const time = new Date(m.createdAt).toLocaleTimeString(locale === "es" ? "es-AR" : "en-US", { hour: "2-digit", minute: "2-digit" });

  if (m.author === "system") {
    const code = m.error ?? "";
    const text = t.notes[code.startsWith("limit:") ? "limit" : code] ?? code;
    return (
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md rounded-full bg-rose/10 px-3 py-1.5 text-center text-xs text-rose">
        {text}
      </motion.p>
    );
  }

  const inbound = m.direction === "in";
  const isDraft = m.status === "draft";
  // Una vez enviado, el borrador deja de ser editable aunque haya quedado abierto.
  const isEditing = editing && isDraft;
  const tone = inbound
    ? "rounded-bl-md bg-white/[0.08]"
    : isDraft
      ? "rounded-br-md border border-dashed border-acid/60 bg-acid/[0.06] text-bone"
      : m.author === "human"
        ? "rounded-br-md bg-violet text-white"
        : "rounded-br-md bg-acid text-ink";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`flex flex-col gap-1 ${inbound ? "items-start" : "items-end"}`}
    >
      {isEditing ? (
        <div className="w-full max-w-md">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(6, draft.split("\n").length + 1)}
            autoFocus
            className="w-full rounded-2xl border border-acid/50 bg-white/[0.04] px-3 py-2 text-[15px] outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-white/35">{t.chat.editHint}</p>
        </div>
      ) : (
        m.texts.map((text, i) => (
          <span key={i} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${tone}`}>
            {text}
          </span>
        ))
      )}
      <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-white/35">
        {isDraft && <span className="text-acid">{t.chat.draft}</span>}
        {m.author === "human" && <span>{t.inbox.human}</span>}
        {m.meta.edited && <span className="text-violet-200">{t.chat.edited}</span>}
        {m.meta.transcribed && <span>{t.chat.transcribed}</span>}
        {m.status === "failed" && <span className="text-rose">{t.chat.failed}</span>}
        {!!m.meta.used?.length && (
          <span>
            {t.chat.used} {m.meta.used.join(" · ")}
          </span>
        )}
        <span>{time}</span>
      </span>
      {isDraft && (
        <div className="flex flex-wrap justify-end gap-2">
          {isEditing ? (
            <>
              <button onClick={() => setEditing(false)} className="rounded-full px-3 py-1.5 text-xs text-white/50 hover:text-white">
                {t.chat.cancel}
              </button>
              <button
                disabled={busy !== null}
                onClick={() =>
                  void run(m.id, () =>
                    approveDraft(
                      m.id,
                      draft
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean),
                    ),
                  )
                }
                className="rounded-full bg-acid px-4 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
              >
                {t.chat.sendEdited}
              </button>
            </>
          ) : (
            <>
              <button
                disabled={busy !== null}
                onClick={() => void run(m.id, () => discardDraft(m.id))}
                className="rounded-full px-3 py-1.5 text-xs text-white/45 hover:text-rose disabled:opacity-50"
              >
                {t.chat.discard}
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-violet hover:text-violet-200"
              >
                {t.chat.edit}
              </button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={busy !== null}
                onClick={() => void run(m.id, () => approveDraft(m.id))}
                className="rounded-full bg-acid px-4 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
              >
                {busy === m.id ? "…" : t.chat.send}
              </motion.button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
