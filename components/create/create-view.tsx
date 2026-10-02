"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { buildConversations, detectOwner, summarize, usableChats } from "@/lib/whatsapp/analyze";
import { type ChatFile, readChatFiles } from "@/lib/whatsapp/files";
import { parseExport } from "@/lib/whatsapp/parse";
import { missingVoiceNotes, voiceNotes, withTranscripts } from "@/lib/whatsapp/voice";
import { SAMPLE_SETS, type SampleSet, loadSampleSet } from "@/lib/whatsapp/sample";
import { useI18n } from "../i18n";
import { FileList, type FileEntry, OwnerPicker, Personality, Stats } from "./analysis";
import { BusinessForm, EMPTY_BUSINESS } from "./business-form";
import { ConversationViewer } from "./conversation-viewer";
import { Dropzone } from "./dropzone";
import { GenerateSection } from "./generate";
import { VoiceNotes } from "./voice-notes";

const reveal = {
  initial: { opacity: 0, y: 40, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: 20, filter: "blur(6px)" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

export function CreateView() {
  const { t: dict } = useI18n();
  const t = dict.create;
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pickedOwner, setPickedOwner] = useState<string | null>(null);
  const [business, setBusiness] = useState(EMPTY_BUSINESS);
  // Notas de voz ya transcriptas, por id (archivo + adjunto).
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});

  // Los chats con los audios transcriptos reemplazados por su texto (🎤).
  const shown = useMemo(
    () => entries.map((e) => ("chat" in e ? { ...e, chat: withTranscripts(e.chat, e.key, transcripts) } : e)),
    [entries, transcripts],
  );
  const chats = useMemo(() => shown.flatMap((e) => ("chat" in e ? [e.chat] : [])), [shown]);
  const voice = useMemo(() => {
    const notes = [];
    let missing = 0;
    for (const e of entries) {
      if (!("chat" in e) || !usableChats([e.chat]).length) continue;
      notes.push(...voiceNotes(e.chat, e.key, e.audios ?? {}));
      missing += missingVoiceNotes(e.chat, e.audios ?? {});
    }
    const langs = entries.flatMap((e) => ("chat" in e && e.chat.language !== "unknown" ? [e.chat.language] : []));
    const language = langs.length ? (langs.filter((l) => l === "es").length >= langs.length / 2 ? "es" : "en") : undefined;
    return { notes, missing, language } as const;
  }, [entries]);
  const guess = useMemo(() => detectOwner(chats), [chats]);
  const owner = pickedOwner && guess.candidates.some((c) => c.name === pickedOwner) ? pickedOwner : guess.owner;
  const conversations = useMemo(() => (owner ? buildConversations(chats, owner) : []), [chats, owner]);
  const summary = useMemo(() => summarize(conversations), [conversations]);
  const hasUsable = usableChats(chats).length > 0;

  function addChatFiles(files: ChatFile[]) {
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.key));
      const next = [...prev];
      for (const f of files) {
        const key = `${f.name}:${f.text.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ key, chat: parseExport(f.text, f.name), ...(f.audios ? { audios: f.audios } : {}) });
      }
      return next;
    });
  }

  async function trySample(set: SampleSet) {
    try {
      addChatFiles(await loadSampleSet(set));
      setBusiness(set.business);
    } catch {
      setEntries((prev) => [...prev, { key: `${set.id}:error`, error: t.openError, fileName: set.id }]);
    }
  }

  async function onFiles(files: File[]) {
    for (const file of files) {
      try {
        addChatFiles(await readChatFiles([file]));
      } catch {
        setEntries((prev) => [
          ...prev,
          { key: `${file.name}:error:${Date.now()}`, error: t.openError, fileName: file.name },
        ]);
      }
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-10">
      <motion.div {...reveal}>
        <Link href="/app" className="font-mono text-xs text-white/40 transition hover:text-acid">
          {dict.common.back}
        </Link>
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-acid">{t.eyebrow}</p>
        <h1 className="mt-4 font-serif text-[clamp(2.8rem,8vw,6rem)] leading-[0.9] tracking-tight">
          {t.titleA} <em className="text-acid">{t.titleB}</em>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/55">{t.intro}</p>
      </motion.div>

      <Section n="1" title={t.sections.chats}>
        <div className="space-y-4">
          <Dropzone onFiles={onFiles} compact={entries.length > 0} />
          {entries.length > 0 ? (
            <>
              <FileList
                entries={shown}
                owner={owner}
                onRemove={(key) => setEntries((prev) => prev.filter((e) => e.key !== key))}
              />
              <VoiceNotes
                notes={voice.notes}
                missing={voice.missing}
                language={voice.language}
                transcripts={transcripts}
                onTranscript={(id, text) => setTranscripts((prev) => ({ ...prev, [id]: text }))}
              />
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 font-mono text-sm text-white/45">{t.tryWith}</span>
                {SAMPLE_SETS.map((set) => (
                  <motion.button
                    key={set.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => trySample(set)}
                    className="rounded-full border border-acid/30 px-4 py-2 text-sm text-acid transition hover:bg-acid hover:text-ink"
                  >
                    {t.samples[set.id]}
                  </motion.button>
                ))}
              </div>
              <HowToExport />
            </div>
          )}
        </div>
      </Section>

      <AnimatePresence>
        {hasUsable && (
          <motion.div key="analysis" {...reveal}>
            <Section n="2" title={t.sections.understood}>
              <div className="space-y-8">
                <OwnerPicker guess={guess} owner={owner} onChange={setPickedOwner} />
                {!owner ? null : conversations.length > 0 ? (
                  <>
                    <Stats summary={summary} />
                    <Personality summary={summary} owner={owner} />
                  </>
                ) : (
                  <p className="text-white/50">{t.noPairs(owner)}</p>
                )}
              </div>
            </Section>

            {owner && conversations.length > 0 && (
              <Section n="3" title={t.sections.conversations} sub={t.sections.conversationsSub}>
                <ConversationViewer conversations={conversations} />
              </Section>
            )}

            <Section n="4" title={t.sections.business} sub={t.sections.businessSub}>
              <BusinessForm value={business} onChange={setBusiness} />
            </Section>

            {owner && conversations.length > 0 && (
              <Section n="5" title={dict.generate.title} sub={dict.generate.sub}>
                <GenerateSection conversations={conversations} owner={owner} business={business} />
              </Section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function Section({ n, title, sub, children }: { n: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="mt-16"
    >
      <div className="mb-6 flex items-baseline gap-4">
        <span className="font-mono text-sm text-acid">{n.padStart(2, "0")}</span>
        <div>
          <h2 className="font-serif text-3xl sm:text-4xl">{title}</h2>
          {sub && <p className="mt-1 text-sm text-white/45">{sub}</p>}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function HowToExport() {
  const t = useI18n().t.create;
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full sm:w-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="font-mono text-sm text-white/50 transition hover:text-bone"
        aria-expanded={open}
      >
        {t.howTo} {open ? "−" : "+"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 grid gap-4 text-sm text-white/60 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-acid">iPhone</p>
                <p className="mt-2">{t.howToIos}</p>
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-acid">Android</p>
                <p className="mt-2">{t.howToAndroid}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
