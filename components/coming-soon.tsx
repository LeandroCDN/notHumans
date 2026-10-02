"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useI18n } from "./i18n";

/** Pantalla de "todavía no está" para las secciones que faltan. */
type Props = { section: "explore"; cta?: { href: string; label: string }; children?: React.ReactNode };

export function ComingSoon({ section, cta, children }: Props) {
  const { t } = useI18n();
  const { eyebrow, title, accent, body } = t[section];
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-4xl flex-col justify-center px-4 sm:px-10">
      <motion.div
        initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link href="/app" className="font-mono text-xs text-white/40 transition hover:text-acid">
          {t.common.back}
        </Link>
        <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-acid">{eyebrow}</p>
        <h1 className="mt-4 font-serif text-[clamp(2.8rem,8vw,6.5rem)] leading-[0.9] tracking-tight">
          {title} <em className="text-acid">{accent}</em>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-white/55">{body}</p>
        {cta ? (
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={cta.href}
              className="inline-flex rounded-full bg-acid px-6 py-3 font-medium text-ink transition hover:scale-[1.03]"
            >
              {cta.label}
            </Link>
            {children}
          </div>
        ) : (
          <p className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 font-mono text-xs text-white/40">
            <span className="size-1.5 animate-pulse rounded-full bg-rose" />
            {t.common.soon}
          </p>
        )}
      </motion.div>
    </main>
  );
}
