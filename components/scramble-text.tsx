"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const GLYPHS = "!<>-_\\/[]{}=+*^?#01アイウエオカキクケコ";

type Props = {
  text: string;
  delay?: number;
  duration?: number;
  className?: string;
};

/** Texto que se "descifra" letra por letra, como una máquina aprendiendo a hablar. */
export function ScrambleText({ text, delay = 0, duration = 1100, className }: Props) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (reduced) {
      setDisplay(text);
      return;
    }
    const reveal = [...text].map((_, i) => delay + (i / text.length) * duration * 0.7 + Math.random() * duration * 0.3);
    let start: number | null = null;
    let last = 0;
    let raf = 0;

    const tick = (now: number) => {
      start ??= now;
      const t = now - start;
      if (now - last > 45) {
        last = now;
        let out = "";
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (t >= reveal[i] || ch === " ") out += ch;
          else if (t >= reveal[i] - duration * 0.6) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          else out += " ";
        }
        setDisplay(out);
      }
      if (t < delay + duration + 50) raf = requestAnimationFrame(tick);
      else setDisplay(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, duration, reduced]);

  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span aria-hidden className="absolute inset-0 whitespace-pre-wrap">
        {display}
      </span>
    </span>
  );
}
