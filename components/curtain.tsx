"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

const FLAG = "nh_from_login";

/** Lo llama el login justo antes de navegar, para que /app continúe el barrido. */
export function markArrivalFromLogin() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {}
}

/** true solo en la primera vista después de loguearse (y consume la marca). */
export function useArrivedFromLogin(): boolean {
  const [arrived] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(FLAG) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem(FLAG);
    } catch {}
  }, []);
  return arrived;
}

/** Continúa el barrido verde del login: la pantalla se destapa hacia arriba. */
export function Curtain() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] bg-acid"
      initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
      animate={{ clipPath: "inset(0% 0% 100% 0%)" }}
      transition={{ duration: 0.9, ease: [0.83, 0, 0.17, 1], delay: 0.05 }}
    />
  );
}
