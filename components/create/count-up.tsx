"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduced = useReducedMotion();
  const fmt = new Intl.NumberFormat(useI18n().t.intl);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [value, reduced]);

  const n = decimals ? Math.round(shown * 10 ** decimals) / 10 ** decimals : Math.round(shown);
  return <>{fmt.format(n)}</>;
}
