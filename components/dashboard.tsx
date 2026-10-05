"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { PlanPanel } from "./account/plan-panel";
import { Curtain, useArrivedFromLogin } from "./curtain";
import { useI18n } from "./i18n";
import { ScrambleText } from "./scramble-text";

export function Dashboard({ name, linked }: { name: string; linked?: string }) {
  const arrived = useArrivedFromLogin();
  const { t } = useI18n();
  // Si venimos del login, esperamos a que el telón se abra antes de mostrar todo.
  const base = arrived ? 0.6 : 0;

  return (
    <>
      {arrived && <Curtain />}
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-10 sm:pt-16">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: base + 0.1 }}
          className="font-mono text-xs uppercase tracking-[0.2em] text-white/40"
        >
          {t.dashboard.verified}
        </motion.p>
        <h1 className="mt-4 font-serif text-[clamp(3rem,8vw,7rem)] leading-[0.9] tracking-tight">
          <ScrambleText text={t.dashboard.hello(name.split(" ")[0])} delay={base * 1000 + 50} duration={900} />
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: base + 0.45, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-xl text-white/55"
        >
          {t.dashboard.question}
        </motion.p>

        <PlanPanel delay={base + 0.55} linked={linked} />

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <TiltCard
            href="/app/new"
            index="01"
            title={t.dashboard.createTitle}
            body={t.dashboard.createBody}
            delay={base + 0.6}
            accent="rgba(198,255,61,0.22)"
          >
            <Birth />
          </TiltCard>
          <TiltCard
            href="/app/explore"
            index="02"
            title={t.dashboard.exploreTitle}
            body={t.dashboard.exploreBody}
            delay={base + 0.75}
            accent="rgba(139,92,246,0.28)"
          >
            <Talk />
          </TiltCard>
          <TiltCard
            href="/app/jobs"
            index="03"
            title={t.dashboard.jobsTitle}
            body={t.dashboard.jobsBody}
            delay={base + 0.9}
            accent="rgba(255,77,141,0.24)"
          >
            <Manual />
          </TiltCard>
        </div>
      </main>
    </>
  );
}

type CardProps = {
  href: string;
  index: string;
  title: string;
  body: string;
  delay: number;
  accent: string;
  children: React.ReactNode;
};

/** Tarjeta que se inclina hacia el cursor y lleva una luz encima. */
function TiltCard({ href, index, title, body, delay, accent, children }: CardProps) {
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 200, damping: 20 });
  const lx = useTransform(px, (v) => `${v * 100}%`);
  const ly = useTransform(py, (v) => `${v * 100}%`);
  const spotlight = useMotionTemplate`radial-gradient(500px circle at ${lx} ${ly}, ${accent}, transparent 55%)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotateX: 20 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay, duration: 1, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 1200 }}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          px.set(0.5);
          py.set(0.5);
        }}
        whileTap={{ scale: 0.98 }}
      >
        <Link
          href={href}
          className="group relative flex h-[420px] flex-col justify-between overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm transition-colors hover:border-white/25 sm:h-[460px] sm:p-10"
        >
          <motion.div className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />
          <div className="relative flex items-start justify-between">
            <span className="font-mono text-sm text-white/40">{index}</span>
            <span className="flex size-12 items-center justify-center rounded-full border border-white/15 text-xl transition-all duration-500 group-hover:rotate-[-45deg] group-hover:border-acid group-hover:bg-acid group-hover:text-ink">
              →
            </span>
          </div>
          <div className="relative flex flex-1 items-center justify-center" style={{ transform: "translateZ(60px)" }}>
            {children}
          </div>
          <div className="relative" style={{ transform: "translateZ(30px)" }}>
            <h2 className="font-serif text-4xl leading-none sm:text-5xl">{title}</h2>
            <p className="mt-3 text-white/55">{body}</p>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  );
}

/** Un notHuman a punto de nacer: un blob que respira y un + que gira. */
function Birth() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="animate-morph absolute size-36 bg-gradient-to-br from-acid via-emerald-400 to-violet opacity-80 blur-xl transition-all duration-700 group-hover:scale-125" />
      <div className="animate-morph relative flex size-28 items-center justify-center bg-gradient-to-br from-acid to-emerald-400 transition-transform duration-700 group-hover:scale-110">
        <span className="font-mono text-5xl font-light text-ink transition-transform duration-700 group-hover:rotate-180">
          +
        </span>
      </div>
    </div>
  );
}

/** Un ida y vuelta de WhatsApp que se escribe solo. */
function Talk() {
  const bubbles = [
    { side: "right", w: "w-24", d: 0 },
    { side: "left", w: "w-36", d: 0.5 },
    { side: "left", w: "w-20", d: 0.9 },
  ] as const;
  return (
    <div className="flex w-56 flex-col gap-2">
      {bubbles.map((b, i) => (
        <motion.span
          key={i}
          className={`h-7 rounded-2xl ${b.w} ${
            b.side === "right" ? "self-end rounded-br-md bg-white/20" : "self-start rounded-bl-md bg-acid"
          }`}
          style={{ originX: b.side === "left" ? 0 : 1 }}
          animate={{ scale: [0.4, 1, 1, 0.4], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 4, times: [0, 0.12, 0.85, 1], repeat: Infinity, delay: b.d, repeatDelay: 0.6 }}
        />
      ))}
    </div>
  );
}

/** El manual del puesto: una hoja que se va completando sola. */
function Manual() {
  const lines = ["w-28", "w-36", "w-24", "w-32"];
  return (
    <div className="w-52 -rotate-3 rounded-2xl bg-bone p-4 shadow-[0_20px_60px_-20px_rgba(255,77,141,0.5)] transition-transform duration-700 group-hover:rotate-0">
      <div className="mb-3 h-2 w-16 rounded-full bg-ink/70" />
      {lines.map((w, i) => (
        <div key={i} className="mt-2 flex items-center gap-2">
          <motion.span
            className="size-2.5 rounded-full bg-rose"
            animate={{ scale: [0, 1, 1, 0] }}
            transition={{ duration: 4, times: [0, 0.1, 0.9, 1], repeat: Infinity, delay: i * 0.35, repeatDelay: 0.4 }}
          />
          <motion.span
            className={`h-2 rounded-full bg-ink/25 ${w}`}
            style={{ originX: 0 }}
            animate={{ scaleX: [0, 1, 1, 0] }}
            transition={{ duration: 4, times: [0, 0.12, 0.9, 1], repeat: Infinity, delay: i * 0.35, repeatDelay: 0.4 }}
          />
        </div>
      ))}
    </div>
  );
}
