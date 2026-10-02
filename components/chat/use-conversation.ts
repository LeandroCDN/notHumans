"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/lib/nothuman/chat";

// La mecánica de un chat estilo WhatsApp, compartida entre el test drive y el link público:
// el notHuman espera un momento por si el cliente manda varios mensajes, responde en varias burbujas
// que aparecen de a una, y lo que el cliente escribe mientras tanto queda para el turno siguiente.

/** Cuánto espera el notHuman por si el cliente manda varios mensajes seguidos. */
const DEBOUNCE_MS = 1300;

/** `original`: lo que había dicho el notHuman antes de que lo corrijan. `saved`: la corrección ya está en una versión. */
export type ConvTurn<M> = ChatTurn & { id: number; meta?: M; original?: string[]; saved?: boolean };

export type Ask<M> = (turns: ChatTurn[]) => Promise<{ messages: string[]; meta?: M }>;

export function useConversation<M>(ask: Ask<M>, describeError: (err: unknown) => string) {
  const [turns, setTurns] = useState<ConvTurn<M>[]>([]);
  // Cuántos mensajes de cada respuesta ya "llegaron" (se muestran de a uno, como alguien tipeando).
  const [shown, setShown] = useState<Record<number, number>>({});
  const [status, setStatus] = useState<"idle" | "waiting" | "thinking">("idle");
  const [error, setError] = useState<string | null>(null);

  const turnsRef = useRef<ConvTurn<M>[]>([]);
  const askRef = useRef(ask);
  const errorRef = useRef(describeError);
  askRef.current = ask;
  errorRef.current = describeError;
  const busy = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function update(next: ConvTurn<M>[]) {
    turnsRef.current = next;
    setTurns(next);
  }

  async function reveal(id: number, messages: string[]) {
    for (let i = 0; i < messages.length; i++) {
      // Un poco más de espera para los mensajes largos, sin pasarse.
      if (i > 0) await new Promise((r) => setTimeout(r, Math.min(1600, 450 + messages[i].length * 22)));
      setShown((s) => ({ ...s, [id]: i + 1 }));
    }
  }

  async function respond() {
    if (busy.current) {
      again.current = true;
      return;
    }
    const snapshot = turnsRef.current;
    if (snapshot.at(-1)?.from !== "client") return;
    busy.current = true;
    setStatus("thinking");
    setError(null);
    try {
      const reply = await askRef.current(snapshot.map(({ from, texts }) => ({ from, texts })));
      // Si mientras tanto se reinició la conversación, la respuesta ya no corresponde.
      const asked = snapshot[snapshot.length - 1];
      const current = turnsRef.current;
      const at = current.findIndex((x) => x.id === asked.id);
      if (at === -1) return;
      // Lo que el cliente escribió mientras esperaba queda después de la respuesta (y dispara otra).
      const later = current[at].texts.slice(asked.texts.length);
      const id = nextId.current++;
      update([
        ...current.slice(0, at),
        { ...current[at], texts: asked.texts },
        { id, from: "nh", texts: reply.messages, meta: reply.meta },
        ...(later.length ? [{ id: nextId.current++, from: "client" as const, texts: later }] : []),
      ]);
      await reveal(id, reply.messages);
    } catch (err) {
      setError(errorRef.current(err));
    } finally {
      busy.current = false;
      setStatus("idle");
      if (again.current) {
        again.current = false;
        void respond();
      }
    }
  }

  function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const current = turnsRef.current;
    const last = current.at(-1);
    update(
      last?.from === "client"
        ? [...current.slice(0, -1), { ...last, texts: [...last.texts, clean] }]
        : [...current, { id: nextId.current++, from: "client", texts: [clean] }],
    );
    if (!busy.current) setStatus("waiting");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void respond(), DEBOUNCE_MS);
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    again.current = false;
    update([]);
    setShown({});
    setError(null);
    setStatus("idle");
  }

  const revealing = turns.some((x) => x.from === "nh" && (shown[x.id] ?? 0) < x.texts.length);
  return {
    turns,
    turnsRef,
    shown,
    setShown,
    status,
    error,
    typing: status === "thinking" || revealing,
    revealing,
    update,
    send,
    reset,
    retry: () => void respond(),
  };
}
