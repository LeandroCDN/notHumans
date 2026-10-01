"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect } from "react";

/** Fondo vivo: blobs que derivan solos + una luz que persigue al cursor. */
export function Backdrop() {
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 50, damping: 18, mass: 0.8 });
  const sy = useSpring(y, { stiffness: 50, damping: 18, mass: 0.8 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [x, y]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-drift absolute -left-[10vw] -top-[20vh] size-[60vw] rounded-full bg-violet/25 blur-[120px]" />
      <div
        className="animate-drift absolute -bottom-[25vh] -right-[15vw] size-[55vw] rounded-full bg-rose/15 blur-[140px]"
        style={{ animationDelay: "-11s" }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse at 50% 30%, black 10%, transparent 70%)",
        }}
      />
      <motion.div
        style={{ x: sx, y: sy, marginLeft: -320, marginTop: -320 }}
        className="absolute left-0 top-0 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(198,255,61,0.16),transparent_62%)]"
      />
    </div>
  );
}
