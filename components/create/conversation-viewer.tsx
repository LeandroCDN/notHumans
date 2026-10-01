"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Conversation } from "@/lib/whatsapp/analyze";

const when = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Lista de conversaciones a la izquierda, la charla elegida a la derecha, tal como la va a ver el modelo. */
export function ConversationViewer({ conversations }: { conversations: Conversation[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0];
  if (!selected) return null;

  return (
    <div className="grid overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.02] md:grid-cols-[280px_1fr]">
      <ul className="max-h-[220px] overflow-y-auto border-b border-white/10 p-2 md:max-h-[520px] md:border-b-0 md:border-r">
        {conversations.map((c) => {
          const active = c.id === selected.id;
          return (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className={`relative w-full rounded-2xl px-4 py-3 text-left transition-colors ${
                  active ? "" : "hover:bg-white/[0.04]"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="conv-active"
                    className="absolute inset-0 rounded-2xl border border-acid/30 bg-acid/[0.08]"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative block truncate font-medium">{c.client}</span>
                <span className="relative block font-mono text-[11px] text-white/40">
                  {when.format(c.start)} · {c.turns.length} turnos
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="relative max-h-[520px] min-h-[320px] overflow-y-auto px-4 py-6 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            {selected.turns.map((turn, i) => {
              const mine = turn.role === "owner";
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.6) }}
                  className={`flex max-w-[85%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`}
                >
                  <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-white/30">
                    {mine ? "vos" : turn.author}
                  </span>
                  {turn.texts.map((t, j) => (
                    <span
                      key={j}
                      className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-[15px] leading-snug ${
                        mine ? "bg-acid text-ink" : "bg-white/[0.07]"
                      } ${t.startsWith("📎") ? "italic opacity-60" : ""}`}
                    >
                      {t}
                    </span>
                  ))}
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
