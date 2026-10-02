"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { scheduleSummary } from "@/lib/job/manual";
import { useJobs } from "@/lib/job/store";
import { useNotHumans } from "@/lib/nothuman/store";
import { useI18n } from "../i18n";
import { JobEditor } from "./job-editor";

// Sección Puestos: a la izquierda la lista, a la derecha el editor del elegido (o uno nuevo).
// El puesto elegido vive en la URL: /app/jobs?job=<id> (o ?job=new).

export function JobsView({ selected }: { selected?: string }) {
  const { t: dict } = useI18n();
  const t = dict.jobs;
  const router = useRouter();
  const { jobs } = useJobs();
  const { list } = useNotHumans();
  const dirty = useRef(false);
  const [lastSaved, setLastSaved] = useState<{ id: string; version: number } | null>(null);
  const onDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  if (jobs === null) return null;
  const job = selected === "new" ? null : (jobs.find((j) => j.id === selected) ?? (selected ? null : jobs[0] ?? null));
  const isNew = selected === "new" || !job;
  const workers = job ? (list ?? []).filter((n) => n.jobId === job.id) : [];

  function go(id: string) {
    if (id === (job?.id ?? "new")) return;
    if (dirty.current && !confirm(t.leave)) return;
    dirty.current = false;
    router.replace(`/app/jobs?job=${id}`, { scroll: false });
  }

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-16 pt-2 sm:px-6">
      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="flex shrink-0 flex-col gap-2 lg:sticky lg:top-4 lg:w-[240px]">
          <p className="hidden px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 lg:block">{t.listTitle}</p>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {jobs.map((j, i) => {
              const active = j.id === job?.id && !isNew;
              const count = (list ?? []).filter((n) => n.jobId === j.id).length;
              return (
                <motion.button
                  key={j.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => go(j.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex shrink-0 flex-col rounded-2xl border px-3.5 py-3 text-left transition lg:w-full ${
                    active ? "border-acid/45 bg-acid/[0.07]" : "border-transparent hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="max-w-56 truncate font-medium">{j.name}</span>
                  <span className="max-w-56 truncate font-mono text-[10px] text-white/40">
                    v{j.version} · {scheduleSummary(j.content.schedule.days, j.content.lang).split(" · ")[0]}
                    {count > 0 ? ` · ${count} notHuman${count > 1 ? "s" : ""}` : ""}
                  </span>
                </motion.button>
              );
            })}
            <button
              onClick={() => go("new")}
              className={`flex shrink-0 items-center gap-2 rounded-2xl border border-dashed px-3.5 py-3 text-sm transition lg:mt-1 ${
                isNew ? "border-acid/60 text-acid" : "border-white/15 text-white/55 hover:border-acid/50 hover:text-acid"
              }`}
            >
              <span className="flex size-7 items-center justify-center rounded-full border border-current text-base">+</span>
              {t.create}
            </button>
          </div>
        </aside>

        <JobEditor
          key={job?.id ?? "new"}
          job={isNew ? null : job}
          workers={workers}
          onDirty={onDirty}
          justSaved={lastSaved && lastSaved.id === job?.id ? lastSaved.version : null}
          onSaved={(j) => setLastSaved({ id: j.id, version: j.version })}
        />
      </div>
    </main>
  );
}
