"use client";

import { animate, motion, useInView } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/lib/me";
import { type Me, PLANS } from "@/lib/plans";
import { PRICED_PLANS, type Quote, aiCost, quote, unitCosts } from "@/lib/pricing";
import { RequestAccess } from "./account/plan-panel";
import { useI18n } from "./i18n";

// Los tres planes con su precio al costo + 5 % y, abajo, las cuentas que lo explican. Se muestra en
// /pricing (público) y en /app/pricing (pestaña de la app). Los números salen de `lib/pricing.ts`.

const ease = [0.22, 1, 0.36, 1] as const;

export function PricingView({ loggedIn }: { loggedIn: boolean }) {
  const { t } = useI18n();
  const tp = t.pricing;
  const quotes = PRICED_PLANS.map(quote);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-10">
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-acid"
      >
        {tp.eyebrow}
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.8, ease }}
        className="mt-3 font-serif text-5xl leading-none sm:text-7xl"
      >
        {tp.title} <em className="text-white/55">{tp.accent}</em>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.8, ease }}
        className="mt-5 max-w-2xl text-lg text-white/65"
      >
        {tp.intro}
      </motion.p>

      {/* Sin sesión no preguntamos por la cuenta (/api/me daría 401). */}
      {loggedIn ? <CardsWithMe quotes={quotes} /> : <Cards quotes={quotes} me={null} loggedIn={false} />}

      <TheMath />
    </main>
  );
}

function CardsWithMe({ quotes }: { quotes: Quote[] }) {
  const me = useMe();
  return <Cards quotes={quotes} me={me} loggedIn />;
}

function Cards({ quotes, me, loggedIn }: { quotes: Quote[]; me: Me | null; loggedIn: boolean }) {
  return (
    <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-stretch">
      {quotes.map((q, i) => (
        <PlanCard key={q.plan} q={q} index={i} me={me} loggedIn={loggedIn} />
      ))}
    </div>
  );
}

function useMoney() {
  const { t } = useI18n();
  return (v: number, small = false) =>
    `US$ ${new Intl.NumberFormat(t.intl, small ? { maximumSignificantDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
}

function PlanCard({ q, index, me, loggedIn }: { q: Quote; index: number; me: Me | null; loggedIn: boolean }) {
  const { t } = useI18n();
  const tp = t.pricing;
  const nf = new Intl.NumberFormat(t.intl);
  const l = PLANS[q.plan];
  const featured = q.plan === "pro";
  const current = me?.plan === q.plan;

  const f = tp.features;
  const features: { text: string; on: boolean; soon?: boolean }[] =
    q.plan === "free"
      ? [
          { text: f.community, on: true, soon: true },
          { text: f.generations("0"), on: false },
          { text: f.replies("0"), on: false },
        ]
      : [
          { text: f.nothumans(nf.format(l.nothumans)), on: true },
          { text: f.jobs(nf.format(l.jobs)), on: true },
          { text: f.generations(nf.format(l.generations)), on: true },
          { text: f.replies(nf.format(l.replies)), on: true },
          { text: f.audio(nf.format(l.audioMinutes)), on: true },
          { text: f.structures(nf.format(l.structures)), on: true },
          { text: f.shareLinks, on: l.shareLinks },
          { text: f.proModel, on: l.proModel },
          { text: f.whatsapp, on: l.connections },
          { text: f.community, on: true, soon: true },
        ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.1, duration: 0.8, ease }}
      whileHover={{ y: -6 }}
      className={`relative flex flex-col overflow-hidden rounded-[32px] border p-6 sm:p-8 ${
        featured
          ? "border-acid/40 bg-gradient-to-br from-acid/[0.09] via-white/[0.02] to-violet/[0.08] shadow-[0_40px_120px_-40px_rgba(198,255,61,0.45)]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      {featured && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-acid/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 6, repeat: Infinity }}
        />
      )}
      <div className="relative flex items-center justify-between gap-2">
        <h2 className="font-serif text-3xl">{t.account.plans[q.plan]}</h2>
        {current ? (
          <span className="rounded-full border border-acid/40 bg-acid/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-acid">
            {tp.current}
          </span>
        ) : (
          featured && (
            <span className="rounded-full bg-acid px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
              {tp.popular}
            </span>
          )
        )}
      </div>
      <p className="relative mt-1 text-white/55">{tp.plans[q.plan].tagline}</p>

      <p className="relative mt-6 flex items-baseline gap-2">
        <span className="font-mono text-sm text-white/45">US$</span>
        <Counter value={q.price} delay={0.4 + index * 0.1} className="font-serif text-6xl leading-none" />
        <span className="font-mono text-xs text-white/45">{tp.perMonth}</span>
      </p>

      <Split q={q} />

      <ul className="relative mt-6 flex-1 space-y-2.5 text-sm">
        {features.map((x) => (
          <li
            key={x.text}
            className={`flex gap-3 ${x.on ? "text-white/80" : "text-white/30 line-through decoration-white/20"}`}
          >
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${x.on ? "bg-acid" : "bg-white/20"}`} />
            <span>
              {x.text}
              {x.soon && (
                <span className="ml-2 rounded-full border border-white/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">
                  {tp.soon}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="relative mt-8">
        {!loggedIn ? (
          <Link
            href="/"
            className={`inline-block rounded-full px-6 py-3 text-sm font-medium transition ${
              featured
                ? "bg-acid text-ink hover:brightness-110"
                : "border border-white/15 bg-white/5 hover:border-acid hover:text-acid"
            }`}
          >
            {tp.plans[q.plan].cta} →
          </Link>
        ) : me && me.plan === "free" && q.plan !== "free" ? (
          <RequestAccess me={me} align="left" />
        ) : (
          !current && (
            <Link href="/app" className="font-mono text-xs text-white/45 transition hover:text-acid">
              {tp.goApp}
            </Link>
          )
        )}
      </div>
    </motion.section>
  );
}

/** El precio sube desde 0 cuando aparece la tarjeta. */
function Counter({ value, delay, className }: { value: number; delay: number; className?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (v: number) =>
    new Intl.NumberFormat(t.intl, { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = animate(0, value, { delay, duration: 1.2, ease, onUpdate: (v) => (el.textContent = fmt(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay, t.intl]);
  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {fmt(value)}
    </span>
  );
}

/** En qué se va el precio: una barra apilada con IA, servidores, comisión y margen. */
function Split({ q }: { q: Quote }) {
  const { t } = useI18n();
  const s = t.pricing.split;
  const money = useMoney();
  const [hover, setHover] = useState<number | null>(null);
  if (q.price === 0) return <p className="relative mt-5 text-xs text-white/40">{s.free}</p>;

  const parts = [
    { label: s.ai, usd: q.ai, color: "bg-acid", dot: "bg-acid" },
    { label: s.infra, usd: q.infra, color: "bg-violet", dot: "bg-violet" },
    { label: s.fee, usd: q.fee, color: "bg-white/40", dot: "bg-white/40" },
    { label: s.margin, usd: q.margin, color: "bg-rose", dot: "bg-rose" },
  ];
  return (
    <div className="relative mt-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{s.title(money(q.price))}</p>
      <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <motion.div
            key={p.label}
            className={`${p.color} h-full transition-opacity ${hover !== null && hover !== i ? "opacity-30" : ""}`}
            initial={{ width: 0 }}
            animate={{ width: `${(p.usd / q.price) * 100}%` }}
            transition={{ delay: 0.6 + i * 0.08, duration: 0.9, ease }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {parts.map((p, i) => (
          <li
            key={p.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            className="flex items-center gap-1.5 text-white/55"
          >
            <span className={`size-1.5 shrink-0 rounded-full ${p.dot}`} />
            <span>{p.label}</span>
            <span className="ml-auto whitespace-nowrap font-mono tabular-nums text-white/75">{money(p.usd)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Las cuentas: cuánto cuesta cada cosa, cuánto gasta una cuenta que usa todo y los supuestos. */
function TheMath() {
  const { t } = useI18n();
  const h = t.pricing.how;
  const money = useMoney();
  const nf = new Intl.NumberFormat(t.intl);
  const units = unitCosts();
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={seen ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.9, ease }}
      className="mt-24"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-acid">{h.eyebrow}</p>
      <h2 className="mt-3 font-serif text-4xl leading-none sm:text-5xl">
        {h.title} <em className="text-white/55">{h.accent}</em>
      </h2>

      <div className="mt-10 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-6">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">{h.unitsTitle}</h3>
          <ul className="mt-4 divide-y divide-white/5">
            {Object.entries(units).map(([k, v]) => (
              <li key={k} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                <span className="text-white/70">{h.units[k]}</span>
                <span className="whitespace-nowrap font-mono tabular-nums text-acid">{money(v, true)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {(["pro", "business"] as const).map((plan) => {
            const { lines, total } = aiCost(PLANS[plan]);
            return (
              <div key={plan} className="rounded-[28px] border border-white/10 bg-white/[0.02] p-6">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
                  {h.fullTitle} · <span className="text-white/80">{t.account.plans[plan]}</span>
                </h3>
                <ul className="mt-4 space-y-2 text-sm">
                  {lines.map((x) => (
                    <li key={x.key} className="flex justify-between gap-3">
                      <span className="text-white/60">{h.lines[x.key](nf.format(x.units))}</span>
                      <span className="whitespace-nowrap font-mono tabular-nums text-white/80">{money(x.usd)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-sm">
                  <p className="flex justify-between gap-3">
                    <span className="text-white/60">{h.modeled}</span>
                    <span className="whitespace-nowrap font-mono tabular-nums">{money(total)}</span>
                  </p>
                  <p className="flex justify-between gap-3">
                    <span className="text-acid/90">{h.cap}</span>
                    <span className="whitespace-nowrap font-mono tabular-nums text-acid">
                      {money(PLANS[plan].costCapUsd)}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-white/10 bg-white/[0.02] p-6">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">{h.assumptionsTitle}</h3>
        <ul className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          {h.assumptions.map((a) => (
            <li key={a} className="flex gap-3 text-white/65">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-acid" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-6 font-mono text-[11px] text-white/35">{h.fine}</p>
    </motion.section>
  );
}
