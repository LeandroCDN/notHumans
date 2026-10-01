"use client";

import { motion } from "motion/react";
import { LOCALES } from "@/lib/i18n/dictionaries";
import { useI18n } from "./i18n";

/** EN | ES con una pastilla que se desliza al idioma activo. */
export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="flex rounded-full border border-white/10 bg-white/5 p-1 font-mono text-[11px] backdrop-blur-md"
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            role="radio"
            aria-checked={active}
            onClick={() => !active && setLocale(l)}
            className={`relative rounded-full px-2.5 py-1 uppercase transition-colors ${
              active ? "text-ink" : "text-white/50 hover:text-bone"
            }`}
          >
            {active && (
              <motion.span
                layoutId="lang-pill"
                className="absolute inset-0 rounded-full bg-acid"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">{l}</span>
          </button>
        );
      })}
    </div>
  );
}
