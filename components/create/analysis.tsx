"use client";

import { AnimatePresence, motion } from "motion/react";
import type { OwnerGuess, Summary } from "@/lib/whatsapp/analyze";
import type { ParsedChat } from "@/lib/whatsapp/parse";
import type { Dict } from "@/lib/i18n/dictionaries";
import { useI18n } from "../i18n";
import { CountUp } from "./count-up";

export type FileEntry =
  | { key: string; chat: ParsedChat; audios?: Record<string, Uint8Array> }
  | { key: string; error: string; fileName: string };

function warningFor(chat: ParsedChat, owner: string | null, t: Dict["create"]["files"]): string | null {
  if (!chat.format) return t.notWhatsapp;
  if (chat.isGroup) return t.group;
  if (chat.participants.length < 2) return t.single;
  if (owner && !chat.participants.some((p) => p.name === owner)) return t.ownerMissing(owner);
  return null;
}

export function FileList({
  entries,
  owner,
  onRemove,
}: {
  entries: FileEntry[];
  owner: string | null;
  onRemove: (key: string) => void;
}) {
  const t = useI18n().t.create.files;
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {entries.map((entry) => {
          const chat = "chat" in entry ? entry.chat : null;
          const warning = "chat" in entry ? warningFor(entry.chat, owner, t) : entry.error;
          const name = "chat" in entry ? entry.chat.fileName : entry.fileName;
          const text = chat?.messages.filter((m) => m.kind === "text").length ?? 0;
          const dropped = chat ? chat.messages.length - text : 0;
          return (
            <motion.li
              key={entry.key}
              layout
              initial={{ opacity: 0, x: -20, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 20, height: 0, marginTop: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 ${
                warning ? "border-rose/30 bg-rose/[0.04]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <span className="min-w-0 basis-full truncate font-medium sm:flex-1 sm:basis-auto">{name}</span>
              {chat?.format && (
                <span className="flex gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                  <Badge>{chat.format === "ios" ? "iOS" : "Android"}</Badge>
                  {chat.language !== "unknown" && <Badge>{chat.language}</Badge>}
                </span>
              )}
              {chat?.format && !warning && (
                <span className="font-mono text-xs text-white/40">
                  {t.messages(text, dropped)}
                </span>
              )}
              {warning && <span className="font-mono text-xs text-rose">{warning}</span>}
              <button
                onClick={() => onRemove(entry.key)}
                className="ml-auto font-mono text-xs text-white/30 transition hover:text-rose sm:ml-0"
                aria-label={t.remove(name)}
              >
                ✕
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/60">{children}</span>;
}

export function OwnerPicker({
  guess,
  owner,
  onChange,
}: {
  guess: OwnerGuess;
  owner: string | null;
  onChange: (name: string) => void;
}) {
  const t = useI18n().t.create.owner;
  const userPicked = owner !== guess.owner;
  const why = guess.reason === "all-files" ? t.becauseAll : t.becauseFile;
  return (
    <div>
      <p className="text-lg">
        {owner && guess.confident && !userPicked ? (
          <>
            {t.youAre} <span className="font-serif text-2xl italic text-acid">{owner}</span>: {why}
          </>
        ) : owner && userPicked ? (
          <>
            {t.youAre} <span className="font-serif text-2xl italic text-acid">{owner}</span>.
          </>
        ) : (
          <>{t.who}</>
        )}
      </p>
      <p className="mt-1 text-sm text-white/40">
        {owner ? t.notYou : t.pick}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {guess.candidates.slice(0, 8).map((c) => {
          const active = c.name === owner;
          return (
            <motion.button
              key={c.name}
              onClick={() => onChange(c.name)}
              whileTap={{ scale: 0.95 }}
              className={`relative rounded-full px-4 py-2 text-sm transition-colors ${
                active ? "text-ink" : "border border-white/15 text-white/70 hover:border-white/40"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="owner-pill"
                  className="absolute inset-0 rounded-full bg-acid"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">
                {c.name}
                <span className={`ml-2 font-mono text-[10px] ${active ? "text-ink/60" : "text-white/30"}`}>
                  {c.messages}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function Stats({ summary }: { summary: Summary }) {
  const { t: dict } = useI18n();
  const t = dict.create.stats;
  const day = new Intl.DateTimeFormat(dict.intl, { day: "numeric", month: "short", year: "numeric" });
  const items = [
    { label: t.conversations, value: summary.conversations },
    { label: t.turns, value: summary.turns },
    { label: t.pairs, value: summary.pairs, hint: t.pairsHint },
    { label: t.ownerMessages, value: summary.ownerMessages },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((it, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
            title={it.hint}
          >
            <p className={`font-serif text-5xl leading-none ${i === 2 ? "text-acid" : ""}`}>
              <CountUp value={it.value} />
            </p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">{it.label}</p>
          </motion.div>
        ))}
      </div>
      {summary.range && (
        <p className="mt-3 font-mono text-xs text-white/35">
          {t.range(day.format(summary.range.from), day.format(summary.range.to))}
        </p>
      )}
    </div>
  );
}

/** Un adelanto de la personalidad, sin IA: emojis, largo, saludos, horario y risas. */
export function Personality({ summary, owner }: { summary: Summary; owner: string }) {
  const t = useI18n().t.create.personality;
  const peak = summary.peakHour ?? 0;
  const facts = [
    summary.avgWords > 0 && {
      label: t.words,
      value: <CountUp value={summary.avgWords} decimals={1} />,
      note: t.wordsNotes[summary.avgWords < 8 ? 0 : summary.avgWords < 16 ? 1 : 2],
    },
    summary.topOpeners.length > 0 && {
      label: t.opener,
      value: <span className="capitalize">{summary.topOpeners[0].word}</span>,
      note: summary.topOpeners
        .slice(1)
        .map((o) => o.word)
        .join(", "),
    },
    summary.peakHour !== null && {
      label: t.peak,
      value: `${peak}h`,
      note: t.peakNotes[peak < 6 ? 0 : peak < 10 ? 1 : peak < 13 ? 2 : peak < 20 ? 3 : 4],
    },
    {
      label: t.laughs,
      value: (
        <>
          <CountUp value={summary.laughRate} />%
        </>
      ),
      note: t.laughsNote,
    },
  ].filter(Boolean) as { label: string; value: React.ReactNode; note: string }[];

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-acid/20 bg-gradient-to-br from-acid/[0.07] via-transparent to-violet/[0.08] p-6 sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-acid">{t.eyebrow}</p>
      <h3 className="mt-3 font-serif text-3xl sm:text-4xl">
        {t.title} <em>{owner}</em> {t.titleEnd}
      </h3>

      {summary.topEmojis.length > 0 && (
        <div className="mt-6 flex items-end gap-4">
          {summary.topEmojis.map((e, i) => (
            <motion.div
              key={e.emoji}
              initial={{ opacity: 0, y: 30, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.08, type: "spring", stiffness: 300, damping: 15 }}
              className="text-center"
            >
              <span className={`block ${i === 0 ? "text-6xl" : "text-4xl"}`}>{e.emoji}</span>
              <span className="font-mono text-[10px] text-white/40">×{e.count}</span>
            </motion.div>
          ))}
        </div>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{f.label}</dt>
            <dd className="mt-1 font-serif text-3xl">{f.value}</dd>
            {f.note && <dd className="text-xs text-white/40">{f.note}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
