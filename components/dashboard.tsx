"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { Curtain, useArrivedFromLogin } from "./curtain";
import { ScrambleText } from "./scramble-text";

export function Dashboard({ user }: { user: string }) {
  const arrived = useArrivedFromLogin();
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
          humanidad verificada ✓
        </motion.p>
        <h1 className="mt-4 font-serif text-[clamp(3rem,8vw,7rem)] leading-[0.9] tracking-tight">
          <ScrambleText text={`Hola, ${user}.`} delay={base * 1000 + 50} duration={900} />
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: base + 0.45, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-xl text-white/55"
        >
          ¿Qué hacemos hoy? ¿Le damos vida a alguien nuevo o charlamos con los que ya existen?
        </motion.p>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <TiltCard
            href="/app/new"
            index="01"
            title="Crear un notHuman"
            body="Subí chats, contanos del negocio. Nosotros le damos voz."
            delay={base + 0.6}
            accent="rgba(198,255,61,0.22)"
          >
            <Birth />
          </TiltCard>
          <TiltCard
            href="/app/explore"
            index="02"
            title="Explorar notHumans"
            body="Elegí uno y hablale. A ver si te das cuenta."
            delay={base + 0.75}
            accent="rgba(139,92,246,0.28)"
          >
            <Crowd />
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

const GHOSTS = [
  { x: -70, y: 10, size: 72, from: "from-violet", to: "to-rose", d: 0 },
  { x: 0, y: -20, size: 88, from: "from-rose", to: "to-amber-300", d: 0.6 },
  { x: 70, y: 12, size: 68, from: "from-sky-400", to: "to-violet", d: 1.2 },
];

/** Una pequeña multitud de gente que no existe. */
function Crowd() {
  return (
    <div className="relative h-40 w-64">
      {GHOSTS.map((g, i) => (
        <motion.div
          key={i}
          className={`animate-morph absolute left-1/2 top-1/2 bg-gradient-to-br ${g.from} ${g.to} opacity-90 transition-all duration-700 group-hover:opacity-100`}
          style={{ width: g.size, height: g.size, marginLeft: g.x - g.size / 2, marginTop: g.y - g.size / 2, animationDelay: `${-i * 3}s` }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: g.d }}
        >
          <span className="flex h-full items-center justify-center font-mono text-sm text-ink/70">?</span>
        </motion.div>
      ))}
    </div>
  );
}
