"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { scheduleSummary } from "@/lib/job/manual";
import { useJobs } from "@/lib/job/store";
import type { NotHuman } from "@/lib/nothuman/schema";
import { assignJob } from "@/lib/nothuman/store";
import { useI18n } from "../i18n";
import { storeErrorMessage } from "../nothuman/store-ui";

/** La pestaña Puesto del panel de un notHuman: dónde trabaja, y asignarle o cambiarle el puesto. */
export function JobTab({ nh }: { nh: NotHuman }) {
  const { t: dict } = useI18n();
  const t = dict.jobs.tab;
  const { jobs } = useJobs();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (jobs === null) return null;
  const current = jobs.find((j) => j.id === nh.jobId) ?? null;

  async function assign(jobId: string | null) {
    setBusy(jobId ?? "none");
    setError(null);
    try {
      await assignJob(nh.id, jobId);
      setPicking(false);
    } catch (err) {
      setError(storeErrorMessage(dict.store, err));
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <div className="rounded-[28px] border border-acid/30 bg-acid/[0.05] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{t.worksAt}</p>
          <p className="mt-2 font-serif text-3xl leading-none">{current.name}</p>
          {current.content.business.what && <p className="mt-2 text-sm text-white/55">{current.content.business.what}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
            <Stat label={dict.jobs.rules.title}>{t.rules(current.content.rules.length)}</Stat>
            <Stat label={dict.jobs.handoff.title}>{t.handoff(current.content.handoff.triggers.length)}</Stat>
            <div className="col-span-2">
              <Stat label={dict.jobs.schedule.title}>{scheduleSummary(current.content.schedule.days, current.content.lang)}</Stat>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/app/jobs?job=${current.id}`}
              className="rounded-full bg-acid px-4 py-2 text-sm font-medium text-ink transition hover:scale-[1.03]"
            >
              {t.edit}
            </Link>
            <button
              onClick={() => setPicking(!picking)}
              className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-acid hover:text-acid"
            >
              {t.change}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-white/15 p-6 text-center">
          <p className="font-serif text-3xl leading-tight">{t.none}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/55">{t.noneSub}</p>
          {jobs.length > 0 ? (
            !picking && (
              <button
                onClick={() => setPicking(true)}
                className="mt-4 rounded-full bg-acid px-5 py-2.5 text-sm font-medium text-ink transition hover:scale-[1.03]"
              >
                {t.pick}
              </button>
            )
          ) : (
            <>
              <p className="mt-4 text-sm text-white/45">{t.empty}</p>
              <Link href="/app/jobs?job=new" className="mt-2 inline-block text-sm text-acid transition hover:text-white">
                {t.create}
              </Link>
            </>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {picking && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-1.5 overflow-hidden"
          >
            {jobs.map((j) => (
              <li key={j.id}>
                <button
                  onClick={() => void assign(j.id)}
                  disabled={busy !== null || j.id === current?.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:cursor-default ${
                    j.id === current?.id ? "border-acid/45 bg-acid/[0.07]" : "border-white/10 hover:border-acid/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{j.name}</span>
                    <span className="block truncate font-mono text-[10px] text-white/40">
                      {t.rules(j.content.rules.length)} · {scheduleSummary(j.content.schedule.days, j.content.lang).split(" · ")[0]}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-acid">{busy === j.id ? "…" : j.id === current?.id ? "✓" : "→"}</span>
                </button>
              </li>
            ))}
            {current && (
              <li>
                <button
                  onClick={() => void assign(null)}
                  disabled={busy !== null}
                  className="w-full rounded-2xl border border-dashed border-white/15 px-4 py-3 text-left text-sm text-white/55 transition hover:border-rose/40 hover:text-rose"
                >
                  {busy === "none" ? "…" : t.none}
                </button>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
      {error && <p className="px-2 text-sm text-rose">{error}</p>}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.05] px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">{label}</div>
      <div className="mt-0.5 leading-snug">{children}</div>
    </div>
  );
}
