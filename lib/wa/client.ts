"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel, ChannelMode, Conversation, WaMessage } from "./types";

// WhatsApp en el navegador. No hay tiempo real (el navegador no habla con la base): la bandeja pregunta cada
// pocos segundos, y más seguido mientras la pestaña está a la vista.

export class WaClientError extends Error {}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } }).catch(() => null);
  if (!res) throw new WaClientError("network");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new WaClientError(data.error === "limit" ? `limit:${data.kind}` : (data.error ?? `HTTP ${res.status}`));
  return data as T;
}

export type ChannelsState = { items: Channel[]; mock: boolean; missing: string[] };

export function useChannels() {
  const [state, setState] = useState<ChannelsState | null>(null);
  const reload = useCallback(async () => {
    setState(await call<ChannelsState>("/api/wa/channels"));
  }, []);
  useEffect(() => {
    reload().catch(() => setState({ items: [], mock: false, missing: [] }));
  }, [reload]);
  return { state, reload };
}

export const createChannel = (c: { phoneNumberId: string; displayPhone: string; nothumanId: string | null; mode: ChannelMode }) =>
  call<Channel>("/api/wa/channels", { method: "POST", body: JSON.stringify(c) });

export const updateChannel = (id: string, patch: Partial<{ displayPhone: string; nothumanId: string | null; mode: ChannelMode }>) =>
  call<Channel>(`/api/wa/channels/${id}`, { method: "PUT", body: JSON.stringify(patch) });

export const removeChannel = (id: string) => call(`/api/wa/channels/${id}`, { method: "DELETE" });

/** Repite `fn` cada `ms` mientras el componente está montado (y la pestaña visible). */
function usePoll(fn: () => Promise<void>, ms: number, key: string) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await ref.current().catch(() => {});
      timer = setTimeout(tick, ms);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ms, key]);
}

export function useConversations(channelId: string | null) {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const load = useCallback(async () => {
    const q = channelId ? `?channel=${channelId}` : "";
    setItems((await call<{ items: Conversation[] }>(`/api/wa/conversations${q}`)).items);
  }, [channelId]);
  usePoll(load, 3000, channelId ?? "all");
  return { items, reload: load };
}

export function useConversation(id: string | null) {
  const [data, setData] = useState<{ id: string; conversation: Conversation; messages: WaMessage[] } | null>(null);
  const load = useCallback(async () => {
    if (!id) return;
    const r = await call<{ conversation: Conversation; messages: WaMessage[] }>(`/api/wa/conversations/${id}`);
    setData({ id, ...r });
  }, [id]);
  usePoll(load, 2500, id ?? "none");
  return { data: data && data.id === id ? data : null, reload: load };
}

export const sendManual = (id: string, text: string) =>
  call<WaMessage>(`/api/wa/conversations/${id}`, { method: "POST", body: JSON.stringify({ action: "send", text }) });

export const askSuggestion = (id: string) =>
  call(`/api/wa/conversations/${id}`, { method: "POST", body: JSON.stringify({ action: "suggest" }) });

export const setStatus = (id: string, status: "bot" | "human") =>
  call(`/api/wa/conversations/${id}`, { method: "PUT", body: JSON.stringify({ status }) });

export const approveDraft = (id: string, texts?: string[]) =>
  call<WaMessage>(`/api/wa/messages/${id}`, { method: "POST", body: JSON.stringify({ action: "send", texts }) });

export const discardDraft = (id: string) =>
  call(`/api/wa/messages/${id}`, { method: "POST", body: JSON.stringify({ action: "discard" }) });

export const simulate = (channelId: string, from: string, name: string, text: string) =>
  call("/api/wa/simulate", { method: "POST", body: JSON.stringify({ channelId, from, name, text }) });
