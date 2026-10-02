"use client";

import { motion } from "motion/react";
import { Fragment } from "react";
import type { NotHuman } from "@/lib/nothuman/schema";
import { useI18n } from "../i18n";

const rise = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
});

/** Resalta {marcadores} como pastillas, para que se vea qué es dato del negocio y qué es estilo. */
export function WithPlaceholders({ text, onAcid = false }: { text: string; onAcid?: boolean }) {
  return (
    <>
      {text.split(/(\{[a-z_]+\})/g).map((part, i) =>
        /^\{[a-z_]+\}$/.test(part) ? (
          <span
            key={i}
            className={`mx-0.5 rounded-md px-1.5 py-0.5 font-mono text-[0.8em] ${
              onAcid ? "bg-ink/15 text-ink" : "bg-violet/25 text-violet-200"
            }`}
          >
            {part.slice(1, -1)}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function ProfileView({ nh }: { nh: NotHuman }) {
  const { t: dict } = useI18n();
  const t = dict.profile;
  const p = nh.profile;
  const date = new Intl.DateTimeFormat(dict.intl, { day: "numeric", month: "short", year: "numeric" }).format(
    nh.createdAt,
  );
  const fixed = nh.examples.filter((e) => e.canonical).length;
  // Primero las correcciones, después los fijos, después el resto.
  const rank = (e: NotHuman["examples"][number]) => (e.corrected ? 2 : e.canonical ? 1 : 0);
  const examples = [...nh.examples].sort((a, b) => rank(b) - rank(a));

  const traits: { label: string; body: React.ReactNode; wide?: boolean }[] = [
    { label: t.tone, body: <Chips items={p.tone} /> },
    { label: t.register, body: p.register },
    {
      label: t.messages,
      body: (
        <>
          {t.length[p.messageStyle.length]} · {p.messageStyle.splitsMessages ? t.splits : t.single}
          {p.messageStyle.capitalization && (
            <span className="mt-2 block text-sm text-white/50">
              {t.capitalization}: {p.messageStyle.capitalization}
            </span>
          )}
          {p.messageStyle.punctuation && (
            <span className="block text-sm text-white/50">
              {t.punctuation}: {p.messageStyle.punctuation}
            </span>
          )}
        </>
      ),
    },
    {
      label: t.emojis,
      body: (
        <>
          <span className="block text-4xl leading-tight">{p.emojis.favorites.join(" ") || "—"}</span>
          <span className="text-sm text-white/50">{t.frequency[p.emojis.frequency]}</span>
        </>
      ),
    },
    { label: t.greetings, body: <Quotes items={p.greetings} /> },
    { label: t.signOffs, body: <Quotes items={p.signOffs} /> },
    { label: t.catchphrases, body: <Quotes items={p.catchphrases} />, wide: true },
    { label: t.sales, body: p.sales, wide: true },
    { label: t.complaints, body: p.complaints, wide: true },
    { label: t.doNots, body: <Chips items={p.doNots} tone="rose" />, wide: true },
  ];

  return (
    <div>
      <motion.div {...rise(0)}>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-acid">
          {p.language} · {t.meta(nh.version, date)}
        </p>
        <h2 className="mt-3 font-serif text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.9] tracking-tight">{nh.name}</h2>
        <p className="mt-5 max-w-3xl font-serif text-2xl leading-snug text-white/80 sm:text-3xl">“{p.summary}”</p>
      </motion.div>

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {traits.map((tr, i) => (
          <motion.div
            key={tr.label}
            {...rise(i + 1)}
            className={`rounded-3xl border border-white/10 bg-white/[0.03] p-5 ${tr.wide ? "lg:col-span-2" : ""}`}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{tr.label}</p>
            <div className="mt-2 leading-relaxed">{tr.body || "—"}</div>
          </motion.div>
        ))}
      </div>

      <motion.div {...rise(traits.length + 1)} className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-3xl sm:text-4xl">{t.examples}</h3>
          <p className="font-mono text-xs text-white/40">{t.examplesSub(nh.examples.length, fixed)}</p>
        </div>
        <p className="mt-1 text-sm text-white/45">{t.placeholderHint}</p>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {examples.map((e, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-3xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-white/30">
                <span>{e.intent.replace(/_/g, " ")}</span>
                {e.corrected ? (
                  <span className="text-violet-300">✎ {t.correctedTag}</span>
                ) : (
                  e.canonical && <span className="text-acid">{t.fixed}</span>
                )}
              </div>
              <span className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl bg-white/[0.07] px-3.5 py-2 text-[15px] leading-snug">
                <WithPlaceholders text={e.context} />
              </span>
              {e.reply.map((r, j) => (
                <span
                  key={j}
                  className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl bg-acid px-3.5 py-2 text-[15px] leading-snug text-ink"
                >
                  <WithPlaceholders text={r} onAcid />
                </span>
              ))}
            </div>
          ))}
        </div>
      </motion.div>

      <p className="mt-10 font-mono text-[11px] text-white/30">
        {t.usage(nh.stats.usage.input, nh.stats.usage.cacheHit, nh.stats.usage.output, nh.stats.model)}
      </p>
    </div>
  );
}

function Chips({ items, tone = "acid" }: { items: string[]; tone?: "acid" | "rose" }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span
          key={x}
          className={`rounded-full border px-3 py-1 text-sm ${
            tone === "acid" ? "border-acid/30 text-acid" : "border-rose/30 text-rose"
          }`}
        >
          {x}
        </span>
      ))}
    </div>
  );
}

function Quotes({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span key={x} className="rounded-2xl bg-white/[0.07] px-3 py-1.5 text-[15px]">
          {x}
        </span>
      ))}
    </div>
  );
}
