"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GenerationError, type Progress, generateNotHuman } from "@/lib/nothuman/generate";
import type { NotHuman } from "@/lib/nothuman/schema";
import { downloadJson, saveNotHuman } from "@/lib/nothuman/store";
import type { Conversation } from "@/lib/whatsapp/analyze";
import { useI18n } from "../i18n";
import { Magnetic } from "../magnetic";
import { ProfileView } from "../nothuman/profile-view";
import type { Business } from "./business-form";

type State =
  | { kind: "idle" }
  | { kind: "running"; progress: Progress }
  | { kind: "error"; message: string }
  | { kind: "done"; nh: NotHuman };

export function GenerateSection(props: { conversations: Conversation[]; owner: string | null; business: Business }) {
  const { locale, t: dict } = useI18n();
  const t = dict.generate;
  const [state, setState] = useState<State>({ kind: "idle" });
  const anchor = useRef<HTMLDivElement>(null);

  // Al arrancar y al terminar, traer la sección a la vista: el botón queda al fondo de una página larga.
  useEffect(() => {
    if (state.kind === "running" || state.kind === "done") {
      anchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [state.kind]);

  async function run() {
    if (!props.owner) return;
    setState({
      kind: "running",
      progress: { phase: "extract", blocksDone: 0, blocksTotal: 1, examples: 0, dropped: 0, notes: [] },
    });
    try {
      const nh = await generateNotHuman({
        conversations: props.conversations,
        owner: props.owner,
        business: props.business,
        uiLang: locale,
        onProgress: (progress) => setState({ kind: "running", progress }),
      });
      saveNotHuman(nh);
      setState({ kind: "done", nh });
    } catch (err) {
      const e = err instanceof GenerationError ? err : new GenerationError("generic", String(err));
      setState({ kind: "error", message: e.code === "generic" ? t.errors.generic(e.message) : t.errors[e.code] });
    }
  }

  return (
    <div ref={anchor} className="scroll-mt-24">
    <AnimatePresence mode="wait">
      {state.kind === "done" ? (
        <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Born nh={state.nh} />
        </motion.div>
      ) : state.kind === "running" ? (
        <motion.div key="running" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <Running progress={state.progress} />
        </motion.div>
      ) : (
        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-start gap-4">
          <Magnetic strength={0.2}>
            <button
              onClick={run}
              disabled={!props.owner}
              className="group relative overflow-hidden rounded-full bg-acid px-8 py-4 text-lg font-medium text-ink shadow-[0_0_60px_-10px_rgba(198,255,61,0.6)] transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="relative z-10">{state.kind === "error" ? t.retry : t.cta}</span>
              <span className="absolute inset-0 -translate-x-full bg-white/40 transition-transform duration-500 group-hover:translate-x-full" />
            </button>
          </Magnetic>
          {!props.owner && <p className="font-mono text-xs text-white/40">{t.needOwner}</p>}
          {state.kind === "error" && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose"
            >
              {state.message}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}

function Running({ progress }: { progress: Progress }) {
  const t = useI18n().t.generate;
  // La extracción ocupa el 85% de la barra; el perfil, el resto.
  const pct =
    progress.phase === "extract" ? (progress.blocksDone / Math.max(1, progress.blocksTotal)) * 85 : 92;

  return (
    <div className="overflow-hidden rounded-[32px] border border-acid/20 bg-gradient-to-br from-acid/[0.06] to-violet/[0.06] p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <div className="relative size-14 shrink-0">
          <div className="animate-morph absolute inset-0 bg-gradient-to-br from-acid to-emerald-400 opacity-90" />
          <div className="animate-morph absolute inset-0 bg-gradient-to-br from-violet to-rose opacity-60 mix-blend-screen [animation-delay:-3s]" />
        </div>
        <div>
          <AnimatePresence mode="wait">
            <motion.p
              key={progress.phase}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="font-serif text-3xl"
            >
              {t.phases[progress.phase]}…
            </motion.p>
          </AnimatePresence>
          <p className="font-mono text-xs text-white/45">
            {progress.phase === "extract" ? t.batch(progress.blocksDone, progress.blocksTotal) : "…"} · {progress.examples}{" "}
            {t.examples}
            {progress.dropped > 0 && ` · ${progress.dropped} ${t.dropped}`}
          </p>
        </div>
      </div>

      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-acid"
          animate={{ width: `${Math.max(4, pct)}%` }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </div>

      {progress.notes.length > 0 && (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{t.notes}</p>
          <ul className="mt-2 space-y-1.5">
            <AnimatePresence initial={false}>
              {progress.notes.map((n) => (
                <motion.li
                  key={n}
                  layout
                  initial={{ opacity: 0, x: -12, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-white/70"
                >
                  <span className="mr-2 text-acid">✦</span>
                  {n}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </div>
  );
}

function Born({ nh }: { nh: NotHuman }) {
  const t = useI18n().t.generate;
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="mb-12 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[32px] bg-acid px-6 py-5 text-ink sm:px-8"
      >
        <p className="font-serif text-3xl sm:text-4xl">{t.born(nh.name)}</p>
        <p className="font-mono text-xs text-ink/60">{t.saved}</p>
        <div className="flex flex-1 flex-wrap justify-end gap-3">
          <button
            onClick={() => downloadJson(nh)}
            className="rounded-full border border-ink/25 px-4 py-2 text-sm transition hover:bg-ink/10"
          >
            {t.download}
          </button>
          <Link href={`/app/n/${nh.id}`} className="rounded-full bg-ink px-4 py-2 text-sm text-acid">
            {t.openProfile}
          </Link>
        </div>
      </motion.div>
      <ProfileView nh={nh} />
    </div>
  );
}
