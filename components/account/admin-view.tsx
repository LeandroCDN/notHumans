"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { AdminUser } from "@/lib/account";
import { PLAN_IDS, type PlanId } from "@/lib/plans";
import { useI18n } from "../i18n";
import { Avatar, PlanBadge } from "./avatar";

// Panel de admin: todas las cuentas, su plan (se cambia acá, a mano) y su consumo del mes.
// Arriba de todo, las que pidieron acceso.

type Data = { users: AdminUser[]; waitlist: { email: string; locale: string; createdAt: number }[] };

export function AdminView({ selfId }: { selfId: string }) {
  const { t } = useI18n();
  const a = t.admin;
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<{ id: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);

  const users = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.users
      .filter((u) => !q || [u.name, u.email, u.handle].some((v) => v?.toLowerCase().includes(q)))
      // Primero los que pidieron acceso y siguen en Free; después, los más nuevos.
      .sort((x, y) => Number(pending(y)) - Number(pending(x)) || y.createdAt - x.createdAt);
  }, [data, query]);

  async function setPlan(u: AdminUser, plan: PlanId) {
    const prev = u.plan;
    setData((d) => d && { ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, plan } : x)) });
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, until: null }),
    }).catch(() => null);
    if (!res?.ok) setData((d) => d && { ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, plan: prev } : x)) });
    setSaved({ id: u.id, ok: !!res?.ok });
    setTimeout(() => setSaved((s) => (s?.id === u.id ? null : s)), 1800);
  }

  if (!data) return null;
  const requests = data.users.filter(pending).length;
  const total = data.users.reduce((n, u) => n + u.costUsd, 0);
  const emails = new Set(data.users.map((u) => u.email?.toLowerCase()).filter(Boolean));
  const nf = new Intl.NumberFormat(t.intl);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-10">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-rose">{a.eyebrow}</p>
      <h1 className="mt-3 font-serif text-5xl leading-none sm:text-6xl">
        {a.title} <em className="text-white/55">{a.accent}</em>
      </h1>
      <p className="mt-3 max-w-2xl text-white/55">{a.sub}</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {requests > 0 && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-full bg-acid px-3 py-1 font-mono text-[11px] font-medium text-ink"
          >
            {a.requests(requests)}
          </motion.span>
        )}
        <span className="font-mono text-[11px] text-white/40">{a.total(data.users.length, `US$ ${total.toFixed(3)}`)}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={a.search}
          aria-label={a.search}
          className="ml-auto h-10 w-full rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm outline-none transition focus:border-acid/60 sm:w-64"
        />
      </div>

      <ul className="mt-5 space-y-2">
        <AnimatePresence initial={false}>
          {users.map((u, i) => (
            <motion.li
              key={u.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03 }}
              className={`grid gap-3 rounded-2xl border px-4 py-3 sm:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1.4fr)_auto] sm:items-center ${
                pending(u) ? "border-acid/40 bg-acid/[0.05]" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={u.name} url={u.avatarUrl} size="size-9" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate">{u.name}</span>
                    {u.id === selfId && <span className="font-mono text-[10px] text-white/40">({a.you})</span>}
                    {pending(u) && <span className="font-mono text-[10px] text-acid">● {a.requested}</span>}
                  </p>
                  <p className="truncate font-mono text-[11px] text-white/40">
                    {[u.email, u.handle && `@${u.handle}`].filter(Boolean).join(" · ")}
                    {" · "}
                    {[u.hasGoogle && a.google, u.legacy && a.legacy].filter(Boolean).join(" + ")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`plan-${u.id}`}>
                  {a.cols.plan}
                </label>
                <select
                  id={`plan-${u.id}`}
                  value={u.plan}
                  disabled={u.id === selfId}
                  onChange={(e) => void setPlan(u, e.target.value as PlanId)}
                  className="cursor-pointer rounded-full border border-white/15 bg-transparent px-3 py-1.5 font-mono text-[11px] outline-none transition hover:border-white/35 focus:border-acid/60 disabled:cursor-default disabled:opacity-60"
                >
                  {PLAN_IDS.map((p) => (
                    <option key={p} value={p} className="bg-ink">
                      {t.account.plans[p]}
                    </option>
                  ))}
                </select>
                <AnimatePresence>
                  {saved?.id === u.id && (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={`font-mono text-[10px] ${saved.ok ? "text-acid" : "text-rose"}`}
                    >
                      {saved.ok ? a.saved : a.failed}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <p className="font-mono text-[11px] text-white/55">
                {u.nothumans} {t.account.meters.nothumans} · {u.jobs} {t.account.meters.jobs}
                <span className="block text-white/35">
                  {a.usage(nf.format(u.used.generations), nf.format(u.used.replies), nf.format(u.used.audioMinutes))}
                </span>
              </p>
              <p className="font-mono text-xs text-white/70 sm:text-right">US$ {u.costUsd.toFixed(3)}</p>
            </motion.li>
          ))}
        </AnimatePresence>
        {users.length === 0 && <p className="py-10 text-center text-white/40">{a.empty}</p>}
      </ul>

      {data.waitlist.length > 0 && (
        <section className="mt-14">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">{a.waitlist(data.waitlist.length)}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.waitlist.map((w) => (
              <li
                key={w.email}
                className={`rounded-full border px-3 py-1.5 font-mono text-[11px] ${
                  emails.has(w.email) ? "border-acid/40 text-acid" : "border-white/10 text-white/60"
                }`}
              >
                {w.email}
                {emails.has(w.email) && <span className="text-acid/70"> · {a.hasAccount}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-2">
        {PLAN_IDS.map((p) => (
          <PlanBadge key={p} plan={p} label={`${t.account.plans[p]} · ${data.users.filter((u) => u.plan === p).length}`} />
        ))}
      </div>
    </main>
  );
}

const pending = (u: AdminUser) => u.accessRequestedAt !== null && u.plan === "free";
