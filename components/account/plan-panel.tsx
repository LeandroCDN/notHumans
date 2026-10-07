"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { requestAccess, useMe } from "@/lib/me";
import type { Me } from "@/lib/plans";
import { useI18n } from "../i18n";
import { PlanBadge } from "./avatar";

// Lo que el panel de inicio muestra de la cuenta: si es Free, la invitación a pedir acceso;
// si tiene plan, los medidores del mes.

export function PlanPanel({ delay = 0, linked }: { delay?: number; linked?: string }) {
  const me = useMe();
  const { t } = useI18n();
  const ta = t.account;
  const linkedText = linked ? ta.linked[linked] : undefined;

  return (
    <div className="mt-10 space-y-4">
      {linkedText && (
        <Notice tone={linked === "ok" ? "ok" : "warn"} delay={delay}>
          {linkedText}
        </Notice>
      )}
      {me?.planExpired && (
        <Notice tone="warn" delay={delay}>
          {ta.expired}
        </Notice>
      )}
      {me && (me.plan === "free" ? <FreeCard me={me} delay={delay} /> : <Meters me={me} delay={delay} />)}
    </div>
  );
}

function Notice({ tone, delay, children }: { tone: "ok" | "warn"; delay: number; children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === "ok"
          ? "border-acid/30 bg-acid/[0.06] text-acid"
          : "border-amber-300/30 bg-amber-300/[0.06] text-amber-200"
      }`}
    >
      {children}
    </motion.p>
  );
}

/** Cuenta Free: lista para mirar, falta la IA. Un botón para pedir acceso (lo ve el admin en su panel). */
function FreeCard({ me, delay }: { me: Me; delay: number }) {
  const { t } = useI18n();
  const f = t.account.free;
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[32px] border border-acid/25 bg-gradient-to-br from-acid/[0.08] via-white/[0.02] to-violet/[0.08] p-7 sm:p-10"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-acid/20 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-acid">{f.eyebrow}</p>
          <h2 className="mt-3 font-serif text-4xl leading-none sm:text-5xl">
            {f.title} <em className="text-white/60">{f.accent}</em>
          </h2>
          <p className="mt-4 text-white/60">{f.body}</p>
        </div>
        <RequestAccess me={me} />
      </div>
    </motion.section>
  );
}

/** Botón "Pedir acceso" → "Acceso pedido ✓". */
export function RequestAccess({ me, align = "right" }: { me: Me; align?: "left" | "right" }) {
  const f = useI18n().t.account.free;
  const [busy, setBusy] = useState(false);
  const done = me.accessRequestedAt !== null;
  return (
    <div className="shrink-0">
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={align === "right" ? "text-right" : ""}
          >
            <p className="font-medium text-acid">{f.requested}</p>
            <p className="text-sm text-white/45">{f.requestedSub}</p>
          </motion.div>
        ) : (
          <motion.button
            key="ask"
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await requestAccess().catch(() => {});
              setBusy(false);
            }}
            className="rounded-full bg-acid px-7 py-3.5 font-medium text-ink shadow-[0_20px_60px_-15px_rgba(198,255,61,0.6)] disabled:opacity-60"
          >
            {f.request}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Los medidores del mes: cuánto usó de cada cosa y cuándo se renueva. */
function Meters({ me, delay }: { me: Me; delay: number }) {
  const { t } = useI18n();
  const m = t.account.meters;
  const resets = new Date(me.resetsAt).toLocaleDateString(t.intl, { day: "numeric", month: "long" });
  const rows = [
    { label: m.nothumans, used: me.used.nothumans, max: me.limits.nothumans },
    { label: m.generations, used: me.used.generations, max: me.limits.generations },
    { label: m.replies, used: me.used.replies, max: me.limits.replies },
    { label: m.audio, used: me.used.audioMinutes, max: me.limits.audioMinutes },
    { label: m.jobs, used: me.used.jobs, max: me.limits.jobs },
  ];
  const nf = new Intl.NumberFormat(t.intl);
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] border border-white/10 bg-white/[0.02] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{m.title}</p>
          <PlanBadge plan={me.plan} label={t.account.plans[me.plan] ?? me.plan} />
        </div>
        <p className="font-mono text-[10px] text-white/35">
          {m.resets(resets)}
          {me.costUsd !== undefined && ` · US$ ${me.costUsd.toFixed(3)}`}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r, i) => {
          const pct = r.max === null ? 0 : r.max === 0 ? 100 : Math.min(100, (r.used / r.max) * 100);
          const full = r.max !== null && r.used >= r.max;
          return (
            <div key={r.label}>
              <p className="flex items-baseline gap-1">
                <span className={`font-serif text-3xl ${full ? "text-rose" : ""}`}>{nf.format(r.used)}</span>
                <span className="font-mono text-[11px] text-white/40">
                  / {r.max === null ? m.unlimited : nf.format(r.max)}
                </span>
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">{r.label}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={`h-full rounded-full ${full ? "bg-rose" : r.max === null ? "bg-white/25" : "bg-acid"}`}
                  initial={{ width: 0 }}
                  animate={{ width: r.max === null ? "100%" : `${pct}%` }}
                  transition={{ delay: delay + 0.2 + i * 0.06, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
