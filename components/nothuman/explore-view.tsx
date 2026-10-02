"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import type { NotHuman } from "@/lib/nothuman/schema";
import { useLocalLeftovers, useNotHumans } from "@/lib/nothuman/store";
import { ComingSoon } from "../coming-soon";
import { useI18n } from "../i18n";
import { ImportJsonButton, LeftoversBanner, StoreErrorNotice } from "./store-ui";
import { HUB_TABS, type HubTab, Workspace } from "./workspace";

// La sección notHumans: Explorar + test drive + perfil en una sola vista.
// A la izquierda la lista; en el centro el chat; al costado un panel con pestañas.
// El notHuman elegido y la pestaña viven en la URL (/app/explore?nh=…&tab=…), así se pueden compartir y recargar.

export const HUES = ["from-acid to-emerald-400", "from-violet to-rose", "from-rose to-amber-300", "from-sky-400 to-violet"];

export function NotHumansHub({ initialId, initialTab }: { initialId?: string; initialTab?: string }) {
  const { t: dict } = useI18n();
  const t = dict.hub;
  const router = useRouter();
  const { list, error, reload } = useNotHumans();
  const leftovers = useLocalLeftovers();
  // Correcciones sin guardar en el chat abierto: no cambiar de notHuman sin avisar.
  const dirty = useRef(false);
  const onDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  if (list === null) return null;
  if (list.length === 0 && !error && leftovers.length === 0) {
    return (
      <ComingSoon section="explore" cta={{ href: "/app/new", label: dict.explore.createCta }}>
        <ImportJsonButton />
      </ComingSoon>
    );
  }

  const nh = list.find((x) => x.id === initialId) ?? list[0];
  const tab: HubTab = HUB_TABS.includes(initialTab as HubTab) ? (initialTab as HubTab) : "chat";
  const go = (id: string | undefined, nextTab: HubTab) =>
    router.replace(`/app/explore?${new URLSearchParams({ ...(id ? { nh: id } : {}), tab: nextTab })}`, { scroll: false });

  function pick(id: string) {
    if (id === nh?.id) return;
    if (dirty.current && !confirm(t.leaveCorrections)) return;
    dirty.current = false;
    go(id, tab);
  }

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-12 pt-2 sm:px-6">
      {error && <StoreErrorNotice error={error} reload={reload} />}
      <LeftoversBanner />

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
        <Sidebar list={list} current={nh?.id} onPick={pick} />
        {nh ? (
          <Workspace
            key={nh.id}
            nh={nh}
            hue={HUES[Math.max(0, list.indexOf(nh)) % HUES.length]}
            tab={tab}
            onTab={(next) => go(nh.id, next)}
            onDirty={onDirty}
          />
        ) : (
          <p className="m-auto py-24 font-serif text-3xl text-white/60">{t.empty}</p>
        )}
      </div>
    </main>
  );
}

/** La lista de notHumans: columna en la compu, fila que se desliza en el celu. */
function Sidebar({ list, current, onPick }: { list: NotHuman[]; current?: string; onPick: (id: string) => void }) {
  const { t: dict } = useI18n();
  const t = dict.hub;
  return (
    <aside className="flex shrink-0 flex-col gap-2 lg:sticky lg:top-4 lg:w-[230px]">
      <p className="hidden px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 lg:block">{t.listTitle}</p>
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {list.map((x, i) => {
          const active = x.id === current;
          return (
            <motion.button
              key={x.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onPick(x.id)}
              aria-current={active ? "true" : undefined}
              className={`relative flex shrink-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition lg:w-full ${
                active ? "border-acid/45 bg-acid/[0.07]" : "border-transparent hover:bg-white/[0.04]"
              }`}
            >
              <span className={`animate-morph size-9 shrink-0 bg-gradient-to-br ${HUES[i % HUES.length]}`} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{x.name}</span>
                <span className="block truncate font-mono text-[10px] text-white/40">
                  v{x.version} · {x.examples.length} {dict.generate.examples}
                </span>
              </span>
            </motion.button>
          );
        })}
        <Link
          href="/app/new"
          className="flex shrink-0 items-center gap-2 rounded-2xl border border-dashed border-white/15 px-3 py-2.5 text-sm text-white/55 transition hover:border-acid/50 hover:text-acid lg:mt-1"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-white/15 text-lg">+</span>
          {t.create}
        </Link>
      </div>
      <div className="hidden px-1 pt-2 lg:block">
        <ImportJsonButton />
      </div>
    </aside>
  );
}
