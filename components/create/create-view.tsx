"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { buildConversations, detectOwner, summarize, usableChats } from "@/lib/whatsapp/analyze";
import { type ChatFile, readChatFiles } from "@/lib/whatsapp/files";
import { parseExport } from "@/lib/whatsapp/parse";
import { SAMPLE_CHATS } from "@/lib/whatsapp/sample";
import { FileList, type FileEntry, OwnerPicker, Personality, Stats } from "./analysis";
import { BusinessForm, EMPTY_BUSINESS } from "./business-form";
import { ConversationViewer } from "./conversation-viewer";
import { Dropzone } from "./dropzone";

const reveal = {
  initial: { opacity: 0, y: 40, filter: "blur(10px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: 20, filter: "blur(6px)" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

export function CreateView() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pickedOwner, setPickedOwner] = useState<string | null>(null);
  const [business, setBusiness] = useState(EMPTY_BUSINESS);

  const chats = useMemo(() => entries.flatMap((e) => ("chat" in e ? [e.chat] : [])), [entries]);
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
        next.push({ key, chat: parseExport(f.text, f.name) });
      }
      return next;
    });
  }

  async function onFiles(files: File[]) {
    for (const file of files) {
      try {
        addChatFiles(await readChatFiles([file]));
      } catch {
        setEntries((prev) => [
          ...prev,
          { key: `${file.name}:error:${Date.now()}`, error: "No pudimos abrir este archivo", fileName: file.name },
        ]);
      }
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-10">
      <motion.div {...reveal}>
        <Link href="/app" className="font-mono text-xs text-white/40 transition hover:text-acid">
          ← volver
        </Link>
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-acid">01 · crear</p>
        <h1 className="mt-4 font-serif text-[clamp(2.8rem,8vw,6rem)] leading-[0.9] tracking-tight">
          Dale vida a un <em className="text-acid">notHuman.</em>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/55">
          Empezá por los chats: de ahí sale cómo habla. Por ahora todo se procesa en tu navegador y no se sube a
          ningún lado.
        </p>
      </motion.div>

      <Section n="1" title="Los chats">
        <div className="space-y-4">
          <Dropzone onFiles={onFiles} compact={entries.length > 0} />
          {entries.length > 0 ? (
            <FileList
              entries={entries}
              owner={owner}
              onRemove={(key) => setEntries((prev) => prev.filter((e) => e.key !== key))}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <button
                onClick={() => addChatFiles(SAMPLE_CHATS)}
                className="font-mono text-sm text-acid underline decoration-acid/30 underline-offset-4 transition hover:decoration-acid"
              >
                probar con chats de ejemplo →
              </button>
              <HowToExport />
            </div>
          )}
        </div>
      </Section>

      <AnimatePresence>
        {hasUsable && (
          <motion.div key="analysis" {...reveal}>
            <Section n="2" title="Lo que entendimos">
              <div className="space-y-8">
                <OwnerPicker guess={guess} owner={owner} onChange={setPickedOwner} />
                {!owner ? null : conversations.length > 0 ? (
                  <>
                    <Stats summary={summary} />
                    <Personality summary={summary} owner={owner} />
                  </>
                ) : (
                  <p className="text-white/50">
                    No encontramos charlas donde un cliente pregunte y {owner} responda. ¿Elegiste bien tu nombre?
                  </p>
                )}
              </div>
            </Section>

            {owner && conversations.length > 0 && (
              <Section n="3" title="Las conversaciones" sub="Así van a llegarle al modelo: agrupadas en turnos, sin multimedia.">
                <ConversationViewer conversations={conversations} />
              </Section>
            )}

            <Section n="4" title="El negocio" sub="Le ayuda al modelo a entender los chats: qué es un producto, qué es un precio.">
              <BusinessForm value={business} onChange={setBusiness} />
            </Section>

            <motion.div {...reveal} className="mt-16 flex flex-col items-start gap-3 border-t border-white/10 pt-10">
              <button
                disabled
                className="cursor-not-allowed rounded-full bg-acid/30 px-8 py-4 text-lg font-medium text-ink/60"
              >
                Generar notHuman →
              </button>
              <p className="font-mono text-xs text-white/40">
                La generación con IA llega en el paso 3. Por ahora, revisá que los chats se lean bien.
              </p>
            </motion.div>
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
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full sm:w-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="font-mono text-sm text-white/50 transition hover:text-bone"
        aria-expanded={open}
      >
        ¿cómo exporto un chat? {open ? "−" : "+"}
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
                <p className="mt-2">Abrí el chat → tocá el nombre arriba → Exportar chat → Sin archivos. Te queda un .zip.</p>
              </div>
              <div className="rounded-2xl border border-white/10 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-acid">Android</p>
                <p className="mt-2">Abrí el chat → ⋮ → Más → Exportar chat → Sin archivos. Te queda un .txt.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
