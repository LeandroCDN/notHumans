"use client";

import { motion } from "motion/react";

// Burbujas de chat estilo WhatsApp, compartidas entre el test drive y el link público.

export function Bubble({ side, corrected, children }: { side: "left" | "right"; corrected?: boolean; children: React.ReactNode }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.6, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      style={{ originX: side === "left" ? 0 : 1, originY: 1 }}
      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
        side === "right"
          ? "rounded-br-md bg-white/[0.09]"
          : `rounded-bl-md bg-acid text-ink ${corrected ? "ring-2 ring-violet ring-offset-2 ring-offset-ink" : ""}`
      }`}
    >
      {children}
    </motion.span>
  );
}

export function Dots() {
  return (
    <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.07] px-3.5 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-acid"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
