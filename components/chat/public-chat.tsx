"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../logo";
import { useI18n } from "../i18n";
import { WithPlaceholders } from "../nothuman/profile-view";
import { Bubble, Dots } from "./bubbles";
import { useConversation } from "./use-conversation";

type ErrorCode = "limit" | "too_fast" | "not_found" | "unavailable";

class PublicChatError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

/** Chat a pantalla completa para el link público: solo la charla, sin costos, modelos ni correcciones. */
export function PublicChat({ token, name, emojis }: { token: string; name: string; emojis: string[] }) {
  const t = useI18n().t.public;
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const conv = useConversation(
    async (turns) => {
      const res = await fetch(`/api/public/${token}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turns }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok) return { messages: data.messages as string[] };
      const code = (["limit", "too_fast", "not_found"] as const).find((c) => c === data.error) ?? "unavailable";
      throw new PublicChatError(code);
    },
    (err) => t.errors[err instanceof PublicChatError ? err.code : "unavailable"],
  );
  const { turns, shown, status, error, typing, revealing } = conv;
  const blocked = error === t.errors.limit || error === t.errors.not_found;

  useEffect(() => {
    if (matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, shown, status, error]);

  function send() {
    if (!draft.trim() || blocked) return;
    conv.send(draft);
    setDraft("");
  }

  return (
    <main className="relative z-10 mx-auto flex h-dvh max-w-2xl flex-col px-3 py-3 sm:px-6 sm:py-8">
      <motion.section
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-white/10 bg-ink/60 backdrop-blur-md"
      >
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="animate-morph size-11 shrink-0 bg-gradient-to-br from-acid to-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-2xl leading-none">{name}</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={typing ? "typing" : "online"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={`mt-1 font-mono text-[11px] ${typing ? "text-acid" : "text-white/40"}`}
              >
                {typing ? t.typing : t.online}
              </motion.p>
            </AnimatePresence>
          </div>
          {emojis.length > 0 && <span className="text-xl">{emojis.join(" ")}</span>}
        </header>

        <div ref={scroller} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-5 sm:px-6">
          {turns.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="m-auto flex max-w-sm flex-col items-center gap-4 text-center"
            >
              <div className="animate-morph size-20 bg-gradient-to-br from-acid to-emerald-400 opacity-90" />
              <p className="font-serif text-3xl">{t.empty(name)}</p>
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
              <div key={turn.id} className="mt-2 flex flex-col items-start gap-1.5">
                {turn.texts.slice(0, shown[turn.id] ?? 0).map((text, i) => (
                  <Bubble key={i} side="left">
                    <WithPlaceholders text={text} onAcid />
                  </Bubble>
                ))}
                {(shown[turn.id] ?? 0) > 0 && (shown[turn.id] ?? 0) < turn.texts.length && <Dots />}
              </div>
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
              {!blocked && (
                <button onClick={conv.retry} className="rounded-full border border-rose/40 px-3 py-1 text-xs">
                  {t.retry}
                </button>
              )}
            </motion.div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 border-t border-white/10 p-3"
        >
          <textarea
            ref={input}
            value={draft}
            rows={1}
            maxLength={1000}
            disabled={blocked}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t.placeholder}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] outline-none transition placeholder:text-white/30 focus:border-acid/50 disabled:opacity-40"
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.9 }}
            disabled={!draft.trim() || blocked}
            aria-label={t.send}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-acid text-lg text-ink transition disabled:opacity-30"
          >
            ↑
          </motion.button>
        </form>
      </motion.section>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 text-[11px] text-white/35">
        <span>{t.disclosure(name)}</span>
        <Link href="/" className="flex items-center gap-1.5 transition hover:text-acid">
          {t.madeWith} <Logo className="text-sm" />
        </Link>
      </footer>
    </main>
  );
}

/** Cuando el link no existe o lo desactivaron. */
export function PublicMissing() {
  const t = useI18n().t.public;
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 sm:px-10">
      <motion.div
        initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-serif text-[clamp(2.8rem,8vw,6rem)] leading-[0.9] tracking-tight">
          {t.missingTitle} <em className="text-acid">{t.missingAccent}</em>
        </h1>
        <p className="mt-6 text-lg text-white/55">{t.missingBody}</p>
        <Link href="/" className="mt-10 inline-block">
          <Logo className="text-2xl" />
        </Link>
      </motion.div>
    </main>
  );
}
