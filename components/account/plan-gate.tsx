"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { can, useMe } from "@/lib/me";
import { useI18n } from "../i18n";
import { RequestAccess } from "./plan-panel";

/**
 * Candado de sección: si el plan no alcanza para crear notHumans (o puestos), en vez de la sección se ve
 * por qué y el botón para pedir acceso. El server controla igual: esto es para no hacer perder el tiempo.
 */
export function PlanGate({ need, children }: { need: "create" | "jobs"; children: React.ReactNode }) {
  const me = useMe();
  const { t } = useI18n();
  const g = t.account.gate;
  // Se decide una sola vez, al entrar: si no, al crear el último notHuman que entra en el plan, el candado
  // taparía la pantalla de "nació" justo después de generarlo.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  if (me && allowed === null) setAllowed(can(me, need));
  if (!me || allowed !== false) return <>{children}</>;
  const free = me.plan === "free";
  const title = need === "jobs" ? g.jobs : free ? g.create : g.createFull;
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-16 sm:px-10">
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 20 }}
        className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center sm:p-12"
      >
        <motion.div
          aria-hidden
          className="mx-auto flex size-20 items-center justify-center rounded-full border border-acid/40 bg-acid/10 text-4xl"
          animate={{ rotate: [0, -8, 8, -4, 0] }}
          transition={{ duration: 1.2, delay: 0.4 }}
        >
          🔒
        </motion.div>
        <h1 className="mt-6 font-serif text-4xl leading-tight sm:text-5xl">{title}</h1>
        {free && <p className="mx-auto mt-4 max-w-lg text-white/55">{t.account.free.body}</p>}
        {free && (
          <div className="mt-8 flex justify-center">
            <RequestAccess me={me} />
          </div>
        )}
      </motion.div>
    </main>
  );
}
