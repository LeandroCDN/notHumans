"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { Backdrop } from "./backdrop";
import { HeroChat } from "./hero-chat";
import { LoginProvider, useLogin } from "./login";
import { Logo } from "./logo";
import { Magnetic } from "./magnetic";
import { ScrambleText } from "./scramble-text";

const rise = {
  hidden: { opacity: 0, y: 40, filter: "blur(10px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: 0.15 + i * 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function HomeView({ loggedIn }: { loggedIn: boolean }) {
  return (
    <LoginProvider loggedIn={loggedIn}>
      <Backdrop />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Finale />
      </main>
      <footer className="flex flex-col items-center justify-between gap-2 px-6 py-10 font-mono text-[11px] text-white/30 sm:flex-row sm:px-10">
        <span>notHumans © 2026</span>
        <span>hecho por humanos (por ahora)</span>
      </footer>
    </LoginProvider>
  );
}

function Nav() {
  const { request } = useLogin();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  return (
    <motion.nav
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 transition-all duration-500 sm:px-10 ${
        scrolled ? "border-b border-white/10 bg-ink/70 py-3 backdrop-blur-xl" : "border-b border-transparent py-5"
      }`}
    >
      <Logo className="text-2xl" />
      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-[11px] text-white/30 md:inline">
          apretá <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-white/60">L</kbd>
        </span>
        <Magnetic>
          <button
            onClick={(e) => request(e)}
            className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm backdrop-blur-md transition hover:border-acid hover:bg-acid hover:text-ink"
          >
            Entrar
          </button>
        </Magnetic>
      </div>
    </motion.nav>
  );
}

function Hero() {
  const { request } = useLogin();
  return (
    <section className="mx-auto grid min-h-[100dvh] max-w-7xl items-center gap-14 px-4 pb-16 pt-28 sm:px-10 lg:grid-cols-[1.15fr_0.85fr]">
      <div>
        <motion.p
          variants={rise}
          initial="hidden"
          animate="show"
          custom={0}
          className="inline-flex items-center gap-2 rounded-full border border-acid/30 bg-acid/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-acid"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-acid" />
          v0.0.0.0.0.01 · experimental
        </motion.p>

        <h1 className="mt-7 text-[clamp(3.2rem,9vw,8rem)] leading-[0.88] tracking-[-0.03em]">
          <motion.span variants={rise} initial="hidden" animate="show" custom={1} className="block font-serif">
            Hablan como
          </motion.span>
          <motion.span variants={rise} initial="hidden" animate="show" custom={2} className="block font-serif italic">
            humanos.
          </motion.span>
          <motion.span
            variants={rise}
            initial="hidden"
            animate="show"
            custom={3}
            className="mt-2 block font-mono text-[0.62em] font-medium tracking-[-0.06em] text-acid"
          >
            <ScrambleText text="No lo son." delay={900} duration={1400} />
          </motion.span>
        </h1>

        <motion.p
          variants={rise}
          initial="hidden"
          animate="show"
          custom={4}
          className="mt-8 max-w-xl text-lg leading-relaxed text-white/60 sm:text-xl"
        >
          Subí tus chats y en minutos va a existir alguien que escribe <em className="text-bone">exactamente</em>{" "}
          como vos: tus muletillas, tus emojis, tu forma de cerrar una venta. Da un poquito de miedo.{" "}
          <span className="text-bone">Está buenísimo.</span>
        </motion.p>

        <motion.div
          variants={rise}
          initial="hidden"
          animate="show"
          custom={5}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Magnetic strength={0.25}>
            <button
              onClick={(e) => request(e)}
              className="group relative overflow-hidden rounded-full bg-acid px-8 py-4 text-lg font-medium text-ink shadow-[0_0_60px_-10px_rgba(198,255,61,0.6)]"
            >
              <span className="relative z-10 flex items-center gap-2">
                Conocé al tuyo
                <span className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
              </span>
              <span className="absolute inset-0 -translate-x-full bg-white/40 transition-transform duration-500 group-hover:translate-x-full" />
            </button>
          </Magnetic>
          <button
            onClick={(e) => request(e)}
            className="font-mono text-sm text-white/50 underline decoration-white/20 underline-offset-4 transition hover:text-acid hover:decoration-acid"
          >
            ya soy humano, quiero entrar
          </button>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 60, rotate: 4 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ delay: 0.6, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <HeroChat />
      </motion.div>
    </section>
  );
}

const MARQUEE = ["entrar", "¿sos humano?", "login", "demostralo", "entrar", "no es un bot", "login", "dale, entrá"];

function Marquee() {
  const { request } = useLogin();
  return (
    <button
      onClick={(e) => request(e)}
      className="group relative block w-full -rotate-2 overflow-hidden border-y border-acid/40 bg-acid py-5 text-ink"
      aria-label="Entrar"
    >
      <div className="animate-marquee flex w-max group-hover:[animation-play-state:paused]">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 1}>
            {MARQUEE.map((w, i) => (
              <span key={i} className="flex items-center gap-8 px-4 font-serif text-4xl italic sm:text-6xl">
                {w}
                <span className="font-mono text-2xl not-italic">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </button>
  );
}

function Finale() {
  const { request } = useLogin();
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-36 text-center sm:px-10">
      <motion.p
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
        className="font-mono text-xs uppercase tracking-[0.2em] text-white/40"
      >
        última pregunta
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 50, filter: "blur(12px)" }}
        whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 font-serif text-[clamp(2.6rem,7vw,6rem)] leading-[0.95] tracking-tight"
      >
        ¿Listo para conocer a alguien <em className="text-acid">que no existe?</em>
      </motion.h2>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 16 }}
        className="mt-12"
      >
        <Magnetic strength={0.4}>
          <button
            onClick={(e) => request(e)}
            className="group relative flex size-40 items-center justify-center rounded-full bg-bone text-lg font-medium text-ink transition-colors hover:bg-acid sm:size-48"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-acid/20 [animation-duration:2.5s]" />
            <span className="relative">Entrar →</span>
          </button>
        </Magnetic>
      </motion.div>
    </section>
  );
}
