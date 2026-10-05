"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { TranscribeError, transcribeAll } from "@/lib/whatsapp/transcribe";
import { VOICE_PREFIX, type VoiceNote, estimateSeconds } from "@/lib/whatsapp/voice";
import { useI18n } from "../i18n";

// Notas de voz al subir chats: cada archivo tiene su botón (adentro de su tarjeta) y hay uno para todos.
// El estado vive en un solo hook para que ambos muestren el mismo progreso.

/** Lo que hay de audio en un archivo subido. */
export type FileVoice = { notes: VoiceNote[]; missing: number };

/** Cómo va la transcripción de un archivo. */
export type VoiceJob = { running: boolean; done: number; total: number; failed: number; seconds: number };

export type Transcriber = {
  jobs: Record<string, VoiceJob>;
  waiting: boolean;
  error: string | null;
  transcribe: (notes: VoiceNote[]) => Promise<void>;
};

export function useTranscriber(
  language: "es" | "en" | undefined,
  onTranscript: (id: string, text: string) => void,
): Transcriber {
  const { t: dict } = useI18n();
  const t = dict.create.voice;
  const limitText = dict.store.errors.limit;
  const [jobs, setJobs] = useState<Record<string, VoiceJob>>({});
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(new Set<string>());

  const transcribe = useCallback(
    async (all: VoiceNote[]) => {
      // Lo que ya se está transcribiendo no se vuelve a mandar (por ejemplo, "todos" después de uno).
      const notes = all.filter((n) => !running.current.has(n.id));
      if (!notes.length) return;
      notes.forEach((n) => running.current.add(n.id));
      setError(null);
      setJobs((prev) => {
        const next = { ...prev };
        for (const n of notes) {
          const j = next[n.entry] && next[n.entry].running ? next[n.entry] : { running: true, done: 0, total: 0, failed: 0, seconds: 0 };
          next[n.entry] = { ...j, running: true, total: j.total + 1 };
        }
        return next;
      });
      const bump = (n: VoiceNote, change: Partial<VoiceJob> & { seconds?: number }, failed = false) => {
        running.current.delete(n.id);
        setJobs((prev) => {
          const j = prev[n.entry];
          const done = j.done + 1;
          return {
            ...prev,
            [n.entry]: {
              ...j,
              done,
              failed: j.failed + (failed ? 1 : 0),
              seconds: j.seconds + (change.seconds ?? 0),
              running: done < j.total,
            },
          };
        });
      };
      try {
        await transcribeAll(notes, language, {
          onResult: (n, text, seconds) => {
            if (text) onTranscript(n.id, text);
            bump(n, { seconds });
          },
          onFailed: (n) => bump(n, {}, true),
          onWaiting: setWaiting,
        });
      } catch (err) {
        const code = err instanceof TranscribeError ? err.code : "generic";
        setError(
          code === "generic"
            ? t.errors.generic(String((err as Error).message))
            : code === "limit"
              ? limitText((err as Error).message)
              : t.errors[code],
        );
        notes.forEach((n) => running.current.delete(n.id));
        setJobs((prev) => {
          const next = { ...prev };
          for (const n of notes) if (next[n.entry]) next[n.entry] = { ...next[n.entry], running: false };
          return next;
        });
      }
    },
    [language, onTranscript, t, limitText],
  );

  return { jobs, waiting, error, transcribe };
}

const minutes = (s: number) => Math.max(1, Math.round(s / 60));

/** La parte de audios adentro de la tarjeta de un archivo subido. */
export function FileVoiceRow({
  voice,
  transcripts,
  transcriber,
}: {
  voice: FileVoice;
  transcripts: Record<string, string>;
  transcriber: Transcriber;
}) {
  const t = useI18n().t.create.voice;
  const [open, setOpen] = useState(false);
  const { notes, missing } = voice;
  if (!notes.length && !missing) return null;

  const pending = notes.filter((n) => !transcripts[n.id]);
  const done = notes.length - pending.length;
  const job = notes.length ? transcriber.jobs[notes[0].entry] : undefined;
  const busy = !!job?.running;
  const estimate = minutes(notes.reduce((s, n) => s + estimateSeconds(n.bytes.length), 0));
  const preview = notes.filter((n) => transcripts[n.id]).slice(0, 4);

  return (
    <div className="basis-full border-t border-white/[0.07] pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {notes.length > 0 && (
          <>
            <Wave active={busy && !transcriber.waiting} />
            <span className="text-sm">
              {done === notes.length && !busy ? (
                <span className="text-acid">✓ {t.allDone(notes.length)}</span>
              ) : busy && job ? (
                <span className="text-violet-200">{t.progress(job.done, job.total)}</span>
              ) : (
                t.found(notes.length, estimate)
              )}
            </span>
            {!busy && pending.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => void transcriber.transcribe(pending)}
                className="rounded-full bg-violet px-3.5 py-1 text-xs font-medium text-white shadow-[0_0_30px_-10px_rgba(139,92,246,0.9)] transition hover:scale-[1.04]"
              >
                {done > 0 ? t.retry(pending.length) : t.cta}
              </motion.button>
            )}
            {preview.length > 0 && !busy && (
              <button onClick={() => setOpen(!open)} className="font-mono text-[11px] text-white/40 transition hover:text-white/70">
                {open ? t.hidePreview : t.showPreview}
              </button>
            )}
            {job && !busy && job.failed > 0 && <span className="font-mono text-[11px] text-rose">{t.failed(job.failed)}</span>}
          </>
        )}
        {missing > 0 && (
          <span className="font-mono text-[11px] text-white/35">{notes.length ? t.someMissing(missing) : t.onlyMissing(missing)}</span>
        )}
      </div>

      {busy && job && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-violet"
            animate={{ width: `${(job.done / Math.max(1, job.total)) * 100}%` }}
            transition={{ type: "spring", stiffness: 60, damping: 18 }}
          />
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-1.5 overflow-hidden"
          >
            {preview.map((n) => (
              <li key={n.id} className="text-sm text-white/65">
                <span className="font-mono text-[11px] text-violet-200">{n.author}</span> {VOICE_PREFIX}
                <span className="italic">“{transcripts[n.id].length > 180 ? `${transcripts[n.id].slice(0, 180)}…` : transcripts[n.id]}”</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Botón al final de la lista para transcribir los audios de todos los archivos. */
export function TranscribeAll({
  files,
  transcripts,
  transcriber,
}: {
  files: FileVoice[];
  transcripts: Record<string, string>;
  transcriber: Transcriber;
}) {
  const t = useI18n().t.create.voice;
  const withAudio = files.filter((f) => f.notes.length);
  const pending = withAudio.flatMap((f) => f.notes.filter((n) => !transcripts[n.id]));
  const busy = withAudio.some((f) => transcriber.jobs[f.notes[0].entry]?.running);
  const showButton = withAudio.length >= 2 && pending.length > 0;

  if (!showButton && !transcriber.error && !transcriber.waiting) return null;
  const estimate = minutes(pending.reduce((s, n) => s + estimateSeconds(n.bytes.length), 0));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3">
      {showButton && (
        <motion.button
          whileTap={{ scale: 0.96 }}
          disabled={busy}
          onClick={() => void transcriber.transcribe(pending)}
          className="rounded-full border border-violet/50 bg-violet/15 px-5 py-2.5 text-sm font-medium text-violet-100 transition hover:bg-violet hover:text-white disabled:opacity-50"
        >
          🎤 {t.all(pending.length, estimate)}
        </motion.button>
      )}
      {transcriber.waiting && <span className="font-mono text-xs text-amber-300">{t.waiting}</span>}
      {transcriber.error && <span className="text-sm text-rose">{transcriber.error}</span>}
    </motion.div>
  );
}

/** Barras de una onda de audio; se mueven mientras transcribe. */
function Wave({ active }: { active: boolean }) {
  const bars = [0.5, 0.9, 0.6, 1, 0.7];
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden>
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-violet"
          style={{ height: `${h * 100}%` }}
          animate={active ? { scaleY: [0.3, 1, 0.5, 0.9, 0.3] } : { scaleY: 0.5 }}
          transition={active ? { duration: 1.1, repeat: Infinity, delay: i * 0.09 } : { duration: 0.4 }}
        />
      ))}
    </span>
  );
}
