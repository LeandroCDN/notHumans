"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TranscribeError, type TranscribeProgress, transcribeAll } from "@/lib/whatsapp/transcribe";
import { VOICE_PREFIX, type VoiceNote, estimateSeconds } from "@/lib/whatsapp/voice";
import { useI18n } from "../i18n";

type Props = {
  notes: VoiceNote[];
  /** Audios mencionados en los chats que no vinieron en el archivo (exportado sin multimedia). */
  missing: number;
  language: "es" | "en" | undefined;
  transcripts: Record<string, string>;
  onTranscript: (id: string, text: string) => void;
};

type State =
  | { kind: "idle" }
  | { kind: "running"; progress: TranscribeProgress }
  | { kind: "done"; progress: TranscribeProgress }
  | { kind: "error"; message: string };

const minutes = (s: number) => Math.max(1, Math.round(s / 60));

/** Tarjeta de notas de voz: cuántas hay, transcribirlas y ver cómo quedaron. */
export function VoiceNotes({ notes, missing, language, transcripts, onTranscript }: Props) {
  const { t: dict } = useI18n();
  const t = dict.create.voice;
  const [state, setState] = useState<State>({ kind: "idle" });

  const pending = notes.filter((n) => !transcripts[n.id]);
  const done = notes.length - pending.length;
  const estimate = notes.reduce((s, n) => s + estimateSeconds(n.bytes.length), 0);

  if (notes.length === 0 && missing === 0) return null;

  async function run() {
    setState({ kind: "running", progress: { done: 0, total: pending.length, failed: 0, seconds: 0, waiting: false } });
    try {
      const progress = await transcribeAll(pending, language, onTranscript, (p) =>
        setState({ kind: "running", progress: p }),
      );
      setState({ kind: "done", progress });
    } catch (err) {
      const code = err instanceof TranscribeError ? err.code : "generic";
      setState({
        kind: "error",
        message: code === "generic" ? t.errors.generic(String((err as Error).message)) : t.errors[code],
      });
    }
  }

  // Un par de audios del dueño ya transcriptos, para que se vea cómo quedaron.
  const preview = notes
    .filter((n) => transcripts[n.id])
    .slice(0, 3)
    .map((n) => ({ who: n.author, text: transcripts[n.id] }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[28px] border border-violet/30 bg-gradient-to-br from-violet/[0.08] to-rose/[0.04] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <Wave active={state.kind === "running" && !state.progress.waiting} />
        <div className="min-w-0 flex-1">
          {notes.length > 0 ? (
            <>
              <p className="font-serif text-2xl leading-tight sm:text-3xl">
                {done === notes.length ? t.allDone(notes.length) : t.found(notes.length, minutes(estimate))}
              </p>
              <p className="mt-1 text-sm text-white/50">{done === notes.length ? t.allDoneSub : t.why}</p>
            </>
          ) : (
            <p className="text-white/70">{t.onlyMissing(missing)}</p>
          )}
        </div>
        {pending.length > 0 && state.kind !== "running" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => void run()}
            className="rounded-full bg-violet px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_40px_-10px_rgba(139,92,246,0.9)] transition hover:scale-[1.03]"
          >
            {done > 0 ? t.retry(pending.length) : t.cta}
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {state.kind === "running" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-violet"
                animate={{ width: `${(state.progress.done / Math.max(1, state.progress.total)) * 100}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 18 }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-white/45">
              {t.progress(state.progress.done, state.progress.total)}
              {state.progress.waiting && <span className="text-amber-300"> · {t.waiting}</span>}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {state.kind === "done" && (
        <p className="mt-4 font-mono text-[11px] text-white/45">
          {t.summary(minutes(state.progress.seconds))}
          {state.progress.failed > 0 && <span className="text-rose"> · {t.failed(state.progress.failed)}</span>}
        </p>
      )}
      {state.kind === "error" && <p className="mt-4 text-sm text-rose">{state.message}</p>}

      {preview.length > 0 && (
        <ul className="mt-5 space-y-2">
          <AnimatePresence initial={false}>
            {preview.map((p, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                className="text-sm text-white/70"
              >
                <span className="font-mono text-[11px] text-violet-200">{p.who}</span> {VOICE_PREFIX}
                <span className="italic">“{p.text.length > 160 ? `${p.text.slice(0, 160)}…` : p.text}”</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {missing > 0 && notes.length > 0 && <p className="mt-4 text-xs text-white/40">{t.someMissing(missing)}</p>}
    </motion.div>
  );
}

/** Barras de una onda de audio; se mueven mientras transcribe. */
function Wave({ active }: { active: boolean }) {
  const bars = [0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8];
  return (
    <div className="flex h-12 items-center gap-1" aria-hidden>
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="w-1.5 rounded-full bg-violet"
          style={{ height: `${h * 100}%` }}
          animate={active ? { scaleY: [0.3, 1, 0.5, 0.9, 0.3] } : { scaleY: 0.45 }}
          transition={active ? { duration: 1.1, repeat: Infinity, delay: i * 0.09 } : { duration: 0.4 }}
        />
      ))}
    </div>
  );
}
