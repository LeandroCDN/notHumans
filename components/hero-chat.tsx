"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { DemoScript } from "@/lib/i18n/dictionaries";
import { useI18n } from "./i18n";
import { Dots } from "./login";

type Line = DemoScript["lines"][number];

type Shown = Line & { id: number };

/** Un chat de WhatsApp que se escribe solo. Al final, la revelación. */
export function HeroChat() {
  const { t } = useI18n();
  const scripts = t.heroChat.scripts;
  const [scriptIdx, setScriptIdx] = useState(0);
  const [messages, setMessages] = useState<Shown[]>([]);
  const [typing, setTyping] = useState(false);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let id = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      for (let s = 0; !cancelled; s++) {
        const script = scripts[s % scripts.length];
        setScriptIdx(s % scripts.length);
        setMessages([]);
        setReveal(false);
        await sleep(700);
        for (const line of script.lines) {
          if (cancelled) return;
          if (line.from === "nh") {
            setTyping(true);
            await sleep(Math.min(650 + line.text.length * 26, 2100));
            if (cancelled) return;
            setTyping(false);
          } else {
            await sleep(1000);
            if (cancelled) return;
          }
          setMessages((m) => [...m, { ...line, id: id++ }]);
          await sleep(380);
        }
        if (cancelled) return;
        setReveal(true);
        await sleep(3400);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scripts]);

  const script = scripts[scriptIdx] ?? scripts[0];

  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="absolute -inset-6 -z-10 rounded-[48px] bg-gradient-to-b from-acid/10 via-violet/10 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[#0f0f12]/80 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
          <motion.div
            key={script.persona}
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className={`animate-morph size-10 bg-gradient-to-br ${script.hue}`}
          />
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.p
                key={script.persona}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="font-medium"
              >
                {script.persona}
              </motion.p>
            </AnimatePresence>
            <p className="font-mono text-[11px] text-white/40">
              {typing ? <span className="text-acid">{t.heroChat.typing}</span> : t.heroChat.online}
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/40">
            WhatsApp
          </span>
        </div>

        <div className="flex h-[360px] flex-col justify-end gap-2 px-4 py-5">
          <AnimatePresence initial={false} mode="popLayout">
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)" }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${
                  m.from === "nh"
                    ? "self-end rounded-br-md bg-acid text-ink"
                    : "self-start rounded-bl-md bg-white/[0.07] text-bone"
                }`}
              >
                {m.text}
              </motion.div>
            ))}
            {typing && (
              <motion.div
                key="typing"
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="self-end rounded-2xl rounded-br-md bg-acid/90 px-4 py-3.5 text-ink"
              >
                <Dots />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative h-14 border-t border-white/5">
          <AnimatePresence mode="wait">
            {reveal ? (
              <motion.p
                key="reveal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center gap-2 px-4 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-acid"
              >
                {t.heroChat.reveal(script.persona)}
              </motion.p>
            ) : (
              <motion.p
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center px-5 text-sm text-white/25"
              >
                {t.heroChat.placeholder}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
