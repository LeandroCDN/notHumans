import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel, ChannelMode, Conversation, ConversationStatus, MessageAuthor, MessageStatus, WaMessage } from "@/lib/wa/types";
import { supabase } from "./nothumans";

// WhatsApp en la base: canales (números conectados), charlas por cliente y mensajes. Lo que se lee para una
// cuenta siempre pasa por sus canales (user_id); lo que llega por el webhook se busca por el número.

export type NewMessage = {
  direction: "in" | "out";
  author: MessageAuthor;
  status: MessageStatus;
  texts: string[];
  waId?: string | null;
  waOutIds?: string[];
  error?: string | null;
  meta?: WaMessage["meta"];
};

export type MessagePatch = Partial<Pick<WaMessage, "status" | "texts" | "error" | "meta">> & { waOutIds?: string[] };

export type WaRepo = {
  channels(userId: string): Promise<Channel[]>;
  channel(id: string, userId: string): Promise<Channel | null>;
  channelByPhone(phoneNumberId: string): Promise<Channel | null>;
  /** Sin filtrar por dueño: solo para lo que hace el server solo (responder a un mensaje que llegó). */
  channelAny(id: string): Promise<Channel | null>;
  /** "taken" si ese número ya está conectado (en esta cuenta o en otra). */
  createChannel(
    userId: string,
    c: { phoneNumberId: string; displayPhone: string; nothumanId: string | null; mode: ChannelMode },
  ): Promise<Channel | "taken">;
  updateChannel(
    id: string,
    userId: string,
    patch: Partial<{ displayPhone: string; nothumanId: string | null; mode: ChannelMode }>,
  ): Promise<Channel | null>;
  removeChannel(id: string, userId: string): Promise<void>;

  conversations(userId: string, channelId?: string): Promise<Conversation[]>;
  conversation(id: string, userId: string): Promise<Conversation | null>;
  conversationAny(id: string): Promise<Conversation | null>;
  upsertConversation(channelId: string, customerWaId: string, customerName: string): Promise<Conversation>;
  setStatus(id: string, status: ConversationStatus): Promise<void>;
  /** Candado para armar una respuesta: false si otro request ya la está armando. */
  lock(id: string, seconds: number): Promise<boolean>;
  unlock(id: string): Promise<void>;

  /** Guarda lo que mandó el cliente. null si ese mensaje ya estaba (Meta reintenta los avisos). */
  addInbound(conversationId: string, waId: string, texts: string[], at: number): Promise<WaMessage | null>;
  addMessage(conversationId: string, m: NewMessage): Promise<WaMessage>;
  updateMessage(id: string, patch: MessagePatch): Promise<WaMessage | null>;
  message(id: string): Promise<WaMessage | null>;
  messages(conversationId: string): Promise<WaMessage[]>;
  discardDrafts(conversationId: string): Promise<void>;
  latestInbound(conversationId: string): Promise<WaMessage | null>;
  /** Meta avisó que una burbuja que mandamos no llegó. */
  failOutbound(waOutId: string, error: string): Promise<void>;
};

const preview = (texts: string[]) => texts.join(" · ").slice(0, 200);

// --- Supabase ------------------------------------------------------------------------------------------

type ChannelRow = {
  id: string;
  user_id: string;
  phone_number_id: string;
  display_phone: string;
  nothuman_id: string | null;
  mode: ChannelMode;
  created_at: string;
};
type ConvRow = {
  id: string;
  channel_id: string;
  customer_wa_id: string;
  customer_name: string;
  status: ConversationStatus;
  last_inbound_at: string | null;
  last_message_at: string;
  preview: string;
};
type MsgRow = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  author: MessageAuthor;
  status: MessageStatus;
  texts: string[];
  wa_id: string | null;
  error: string | null;
  meta: WaMessage["meta"] | null;
  created_at: string;
};

const channelFrom = (r: ChannelRow): Channel => ({
  id: r.id,
  userId: r.user_id,
  phoneNumberId: r.phone_number_id,
  displayPhone: r.display_phone,
  nothumanId: r.nothuman_id,
  mode: r.mode,
  createdAt: Date.parse(r.created_at),
});
const convFrom = (r: ConvRow, pending = 0): Conversation => ({
  id: r.id,
  channelId: r.channel_id,
  customerWaId: r.customer_wa_id,
  customerName: r.customer_name,
  status: r.status,
  lastInboundAt: r.last_inbound_at ? Date.parse(r.last_inbound_at) : null,
  lastMessageAt: Date.parse(r.last_message_at),
  preview: r.preview,
  pending,
});
const msgFrom = (r: MsgRow): WaMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  direction: r.direction,
  author: r.author,
  status: r.status,
  texts: Array.isArray(r.texts) ? r.texts : [],
  waId: r.wa_id,
  error: r.error,
  meta: r.meta ?? {},
  createdAt: Date.parse(r.created_at),
});

function supabaseWa(db: SupabaseClient): WaRepo {
  const fail = (what: string, e: { message: string }) => new Error(`Supabase (whatsapp ${what}): ${e.message}`);
  const convCols = "id, channel_id, customer_wa_id, customer_name, status, last_inbound_at, last_message_at, preview";

  async function withPending(rows: ConvRow[]): Promise<Conversation[]> {
    if (!rows.length) return [];
    const { data, error } = await db
      .from("wa_messages")
      .select("conversation_id")
      .eq("status", "draft")
      .in(
        "conversation_id",
        rows.map((r) => r.id),
      );
    if (error) throw fail("pending", error);
    const count = new Map<string, number>();
    for (const r of data as { conversation_id: string }[]) count.set(r.conversation_id, (count.get(r.conversation_id) ?? 0) + 1);
    return rows.map((r) => convFrom(r, count.get(r.id) ?? 0));
  }

  async function touch(conversationId: string, m: NewMessage, at = new Date()) {
    if (m.status === "draft" || m.status === "discarded" || m.author === "system") return;
    const patch: Record<string, unknown> = { last_message_at: at.toISOString(), preview: preview(m.texts) };
    if (m.direction === "in") patch.last_inbound_at = at.toISOString();
    await db.from("wa_conversations").update(patch).eq("id", conversationId);
  }

  const repo: WaRepo = {
    async channels(userId) {
      const { data, error } = await db.from("wa_channels").select("*").eq("user_id", userId).order("created_at");
      if (error) throw fail("channels", error);
      return (data as ChannelRow[]).map(channelFrom);
    },
    async channel(id, userId) {
      const { data, error } = await db.from("wa_channels").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw fail("channel", error);
      return data ? channelFrom(data as ChannelRow) : null;
    },
    async channelByPhone(phoneNumberId) {
      const { data, error } = await db.from("wa_channels").select("*").eq("phone_number_id", phoneNumberId).maybeSingle();
      if (error) throw fail("channel by phone", error);
      return data ? channelFrom(data as ChannelRow) : null;
    },
    async channelAny(id) {
      const { data, error } = await db.from("wa_channels").select("*").eq("id", id).maybeSingle();
      if (error) throw fail("channel", error);
      return data ? channelFrom(data as ChannelRow) : null;
    },
    async createChannel(userId, c) {
      const { data, error } = await db
        .from("wa_channels")
        .insert({
          user_id: userId,
          phone_number_id: c.phoneNumberId,
          display_phone: c.displayPhone,
          nothuman_id: c.nothumanId,
          mode: c.mode,
        })
        .select("*")
        .single();
      if (error?.code === "23505") return "taken";
      if (error) throw fail("create channel", error);
      return channelFrom(data as ChannelRow);
    },
    async updateChannel(id, userId, patch) {
      const row: Record<string, unknown> = {};
      if (patch.displayPhone !== undefined) row.display_phone = patch.displayPhone;
      if (patch.nothumanId !== undefined) row.nothuman_id = patch.nothumanId;
      if (patch.mode !== undefined) row.mode = patch.mode;
      const { data, error } = await db
        .from("wa_channels")
        .update(row)
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();
      if (error) throw fail("update channel", error);
      return data ? channelFrom(data as ChannelRow) : null;
    },
    async removeChannel(id, userId) {
      const { error } = await db.from("wa_channels").delete().eq("id", id).eq("user_id", userId);
      if (error) throw fail("remove channel", error);
    },

    async conversations(userId, channelId) {
      const owned = (await repo.channels(userId)).map((c) => c.id).filter((id) => !channelId || id === channelId);
      if (!owned.length) return [];
      const { data, error } = await db
        .from("wa_conversations")
        .select(convCols)
        .in("channel_id", owned)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (error) throw fail("conversations", error);
      return withPending(data as ConvRow[]);
    },
    async conversation(id, userId) {
      const c = await repo.conversationAny(id);
      if (!c) return null;
      const { count, error } = await db
        .from("wa_channels")
        .select("id", { count: "exact", head: true })
        .eq("id", c.channelId)
        .eq("user_id", userId);
      if (error) throw fail("conversation owner", error);
      return count ? c : null;
    },
    async conversationAny(id) {
      const { data, error } = await db.from("wa_conversations").select(convCols).eq("id", id).maybeSingle();
      if (error) throw fail("conversation", error);
      return data ? (await withPending([data as ConvRow]))[0] : null;
    },
    async upsertConversation(channelId, customerWaId, customerName) {
      const { data, error } = await db
        .from("wa_conversations")
        .upsert(
          { channel_id: channelId, customer_wa_id: customerWaId, ...(customerName ? { customer_name: customerName.slice(0, 120) } : {}) },
          { onConflict: "channel_id,customer_wa_id" },
        )
        .select(convCols)
        .single();
      if (error) throw fail("upsert conversation", error);
      return convFrom(data as ConvRow);
    },
    async setStatus(id, status) {
      const { error } = await db.from("wa_conversations").update({ status }).eq("id", id);
      if (error) throw fail("status", error);
    },
    async lock(id, seconds) {
      const now = new Date();
      const { data, error } = await db
        .from("wa_conversations")
        .update({ generating_until: new Date(now.getTime() + seconds * 1000).toISOString() })
        .eq("id", id)
        .or(`generating_until.is.null,generating_until.lt.${now.toISOString()}`)
        .select("id");
      if (error) throw fail("lock", error);
      return !!data?.length;
    },
    async unlock(id) {
      await db.from("wa_conversations").update({ generating_until: null }).eq("id", id);
    },

    async addInbound(conversationId, waId, texts, at) {
      const m: NewMessage = { direction: "in", author: "customer", status: "received", texts, waId };
      const { data, error } = await db
        .from("wa_messages")
        .insert({ conversation_id: conversationId, direction: "in", author: "customer", status: "received", texts, wa_id: waId })
        .select("*")
        .single();
      if (error?.code === "23505") return null;
      if (error) throw fail("add inbound", error);
      await touch(conversationId, m, new Date(at));
      return msgFrom(data as MsgRow);
    },
    async addMessage(conversationId, m) {
      const { data, error } = await db
        .from("wa_messages")
        .insert({
          conversation_id: conversationId,
          direction: m.direction,
          author: m.author,
          status: m.status,
          texts: m.texts,
          wa_id: m.waId ?? null,
          wa_out_ids: m.waOutIds ?? [],
          error: m.error ?? null,
          meta: m.meta ?? {},
        })
        .select("*")
        .single();
      if (error) throw fail("add message", error);
      await touch(conversationId, m);
      return msgFrom(data as MsgRow);
    },
    async updateMessage(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.texts !== undefined) row.texts = patch.texts;
      if (patch.error !== undefined) row.error = patch.error;
      if (patch.meta !== undefined) row.meta = patch.meta;
      if (patch.waOutIds !== undefined) row.wa_out_ids = patch.waOutIds;
      const { data, error } = await db.from("wa_messages").update(row).eq("id", id).select("*").maybeSingle();
      if (error) throw fail("update message", error);
      if (!data) return null;
      const m = msgFrom(data as MsgRow);
      if (patch.status === "sent") await touch(m.conversationId, { ...m, waOutIds: [] });
      return m;
    },
    async message(id) {
      const { data, error } = await db.from("wa_messages").select("*").eq("id", id).maybeSingle();
      if (error) throw fail("message", error);
      return data ? msgFrom(data as MsgRow) : null;
    },
    async messages(conversationId) {
      const { data, error } = await db
        .from("wa_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .neq("status", "discarded")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw fail("messages", error);
      return (data as MsgRow[]).map(msgFrom).reverse();
    },
    async discardDrafts(conversationId) {
      const { error } = await db
        .from("wa_messages")
        .update({ status: "discarded" })
        .eq("conversation_id", conversationId)
        .eq("status", "draft");
      if (error) throw fail("discard drafts", error);
    },
    async latestInbound(conversationId) {
      const { data, error } = await db
        .from("wa_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw fail("latest inbound", error);
      return data ? msgFrom(data as MsgRow) : null;
    },
    async failOutbound(waOutId, err) {
      const { error } = await db
        .from("wa_messages")
        .update({ status: "failed", error: err.slice(0, 300) })
        .contains("wa_out_ids", [waOutId]);
      if (error) throw fail("fail outbound", error);
    },
  };
  return repo;
}

// --- Memoria (desarrollo y tests) ----------------------------------------------------------------------

type MemMsg = WaMessage & { waOutIds: string[]; seq: number };
type MemConv = Omit<Conversation, "pending"> & { lockedUntil: number };
type Mem = { channels: Map<string, Channel>; convs: Map<string, MemConv>; msgs: Map<string, MemMsg>; seq: number };

function memoryWa(): WaRepo {
  const g = globalThis as unknown as { __nhWa?: Mem };
  const s = (g.__nhWa ??= { channels: new Map(), convs: new Map(), msgs: new Map(), seq: 0 });
  const strip = ({ waOutIds: _o, seq: _s, ...m }: MemMsg): WaMessage => m;
  const pending = (id: string) => [...s.msgs.values()].filter((m) => m.conversationId === id && m.status === "draft").length;
  const conv = ({ lockedUntil: _l, ...c }: MemConv): Conversation => ({ ...c, pending: pending(c.id) });
  const touch = (conversationId: string, m: NewMessage | WaMessage, at = Date.now()) => {
    const c = s.convs.get(conversationId);
    if (!c || m.status === "draft" || m.status === "discarded" || m.author === "system") return;
    c.lastMessageAt = at;
    c.preview = preview(m.texts);
    if (m.direction === "in") c.lastInboundAt = at;
  };
  const add = (conversationId: string, m: NewMessage): MemMsg => {
    const msg: MemMsg = {
      id: randomUUID(),
      conversationId,
      direction: m.direction,
      author: m.author,
      status: m.status,
      texts: m.texts,
      waId: m.waId ?? null,
      error: m.error ?? null,
      meta: m.meta ?? {},
      createdAt: Date.now(),
      waOutIds: m.waOutIds ?? [],
      seq: ++s.seq,
    };
    s.msgs.set(msg.id, msg);
    return msg;
  };
  const ordered = (conversationId: string) =>
    [...s.msgs.values()].filter((m) => m.conversationId === conversationId).sort((a, b) => a.seq - b.seq);

  const repo: WaRepo = {
    async channels(userId) {
      return [...s.channels.values()].filter((c) => c.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
    },
    async channel(id, userId) {
      const c = s.channels.get(id);
      return c && c.userId === userId ? c : null;
    },
    async channelByPhone(phoneNumberId) {
      return [...s.channels.values()].find((c) => c.phoneNumberId === phoneNumberId) ?? null;
    },
    async channelAny(id) {
      return s.channels.get(id) ?? null;
    },
    async createChannel(userId, c) {
      if ([...s.channels.values()].some((x) => x.phoneNumberId === c.phoneNumberId)) return "taken";
      const channel: Channel = { id: randomUUID(), userId, createdAt: Date.now(), ...c };
      s.channels.set(channel.id, channel);
      return channel;
    },
    async updateChannel(id, userId, patch) {
      const c = s.channels.get(id);
      if (!c || c.userId !== userId) return null;
      Object.assign(c, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      return c;
    },
    async removeChannel(id, userId) {
      const c = s.channels.get(id);
      if (!c || c.userId !== userId) return;
      s.channels.delete(id);
      for (const cv of [...s.convs.values()].filter((x) => x.channelId === id)) {
        s.convs.delete(cv.id);
        for (const m of ordered(cv.id)) s.msgs.delete(m.id);
      }
    },

    async conversations(userId, channelId) {
      const owned = new Set((await repo.channels(userId)).map((c) => c.id).filter((id) => !channelId || id === channelId));
      return [...s.convs.values()]
        .filter((c) => owned.has(c.channelId))
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        .map(conv);
    },
    async conversation(id, userId) {
      const c = s.convs.get(id);
      return c && s.channels.get(c.channelId)?.userId === userId ? conv(c) : null;
    },
    async conversationAny(id) {
      const c = s.convs.get(id);
      return c ? conv(c) : null;
    },
    async upsertConversation(channelId, customerWaId, customerName) {
      let c = [...s.convs.values()].find((x) => x.channelId === channelId && x.customerWaId === customerWaId);
      if (!c) {
        c = {
          id: randomUUID(),
          channelId,
          customerWaId,
          customerName: "",
          status: "bot",
          lastInboundAt: null,
          lastMessageAt: Date.now(),
          preview: "",
          lockedUntil: 0,
        };
        s.convs.set(c.id, c);
      }
      if (customerName) c.customerName = customerName.slice(0, 120);
      return conv(c);
    },
    async setStatus(id, status) {
      const c = s.convs.get(id);
      if (c) c.status = status;
    },
    async lock(id, seconds) {
      const c = s.convs.get(id);
      if (!c || c.lockedUntil > Date.now()) return false;
      c.lockedUntil = Date.now() + seconds * 1000;
      return true;
    },
    async unlock(id) {
      const c = s.convs.get(id);
      if (c) c.lockedUntil = 0;
    },

    async addInbound(conversationId, waId, texts, at) {
      if ([...s.msgs.values()].some((m) => m.waId === waId)) return null;
      const m = add(conversationId, { direction: "in", author: "customer", status: "received", texts, waId });
      touch(conversationId, m, at);
      return strip(m);
    },
    async addMessage(conversationId, m) {
      const msg = add(conversationId, m);
      touch(conversationId, msg);
      return strip(msg);
    },
    async updateMessage(id, patch) {
      const m = s.msgs.get(id);
      if (!m) return null;
      const { waOutIds, ...rest } = patch;
      Object.assign(m, rest);
      if (waOutIds) m.waOutIds = waOutIds;
      if (patch.status === "sent") touch(m.conversationId, m);
      return strip(m);
    },
    async message(id) {
      const m = s.msgs.get(id);
      return m ? strip(m) : null;
    },
    async messages(conversationId) {
      return ordered(conversationId)
        .filter((m) => m.status !== "discarded")
        .slice(-200)
        .map(strip);
    },
    async discardDrafts(conversationId) {
      for (const m of ordered(conversationId)) if (m.status === "draft") m.status = "discarded";
    },
    async latestInbound(conversationId) {
      const m = ordered(conversationId)
        .filter((x) => x.direction === "in")
        .at(-1);
      return m ? strip(m) : null;
    },
    async failOutbound(waOutId, error) {
      for (const m of s.msgs.values()) {
        if (m.waOutIds.includes(waOutId)) Object.assign(m, { status: "failed", error });
      }
    },
  };
  return repo;
}

let repo: WaRepo | null = null;
export function wa(): WaRepo {
  if (repo) return repo;
  const db = supabase();
  repo = db ? supabaseWa(db) : memoryWa();
  return repo;
}

/** Anota un aviso del webhook (para diagnosticar). Nunca rompe el webhook: si falla, solo lo dice en el log. */
export async function logWebhook(entry: {
  outcome: "bad_signature" | "bad_json" | "ok" | "no_channel" | "error";
  phoneNumberId?: string | null;
  messages?: number;
  statuses?: number;
  detail?: string;
}): Promise<void> {
  try {
    const db = supabase();
    if (!db) return;
    await db.from("wa_webhook_log").insert({
      outcome: entry.outcome,
      phone_number_id: entry.phoneNumberId ?? null,
      messages: entry.messages ?? 0,
      statuses: entry.statuses ?? 0,
      detail: entry.detail?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.warn("WhatsApp: no se pudo anotar el aviso", err);
  }
}
