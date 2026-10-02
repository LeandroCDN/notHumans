"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { NotHuman } from "@/lib/nothuman/schema";
import { refreshNotHumans, restoreVersion, StoreError, useVersions } from "@/lib/nothuman/store";
import type { VersionNote } from "@/lib/nothuman/versions";
import { useI18n } from "../i18n";
import { storeErrorMessage } from "./store-ui";

/** Línea de tiempo de versiones: qué cambió en cada una, y volver a una anterior (como versión nueva). */
export function VersionHistory({ nh }: { nh: NotHuman }) {
  const { t: dict } = useI18n();
  const t = dict.versions;
  const items = useVersions(nh.id, nh.version);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  if (!items || items.length < 2) return null;

  const when = (ms: number) =>
    new Intl.DateTimeFormat(dict.intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ms);
  const label = (n: VersionNote) =>
    n.kind === "corrections" ? t.corrections(n.count) : n.kind === "restored" ? t.restored(n.from) : t.generated;

  async function restore(version: number) {
    setBusy(version);
    setError(null);
    try {
      await restoreVersion(nh.id, nh.version, version);
    } catch (err) {
      setError({
        message: storeErrorMessage(dict.store, err),
        conflict: err instanceof StoreError && err.code === "conflict",
      });
    }
    setBusy(null);
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 font-mono text-xs text-white/50 transition hover:text-acid"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }}>›</motion.span>
        {t.title(items.length)}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden border-l border-white/10 pl-5"
          >
            {items.map((v, i) => {
              const current = v.version === nh.version;
              return (
                <motion.li
                  key={v.version}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
                >
                  <span
                    className={`absolute -left-[25px] top-[13px] size-2 rounded-full ${
                      current ? "bg-acid shadow-[0_0_10px_var(--color-acid)]" : "bg-white/25"
                    }`}
                  />
                  <span className={`font-mono text-sm ${current ? "text-acid" : "text-white/70"}`}>v{v.version}</span>
                  <span className="text-sm text-white/70">{label(v.note)}</span>
                  <span className="font-mono text-[11px] text-white/35">
                    {when(v.createdAt)} · {v.createdBy} · {t.examples(v.examples)}
                  </span>
                  {current ? (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-acid">{t.current}</span>
                  ) : (
                    <button
                      onClick={() => void restore(v.version)}
                      disabled={busy !== null}
                      className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[11px] text-white/60 transition hover:border-acid hover:text-acid disabled:opacity-40"
                    >
                      {busy === v.version ? "…" : t.restore}
                    </button>
                  )}
                </motion.li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>
      {error && (
        <p className="mt-3 text-sm text-rose">
          {error.message}
          {error.conflict && (
            <button onClick={refreshNotHumans} className="ml-2 underline underline-offset-2">
              {dict.chat.reload}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
