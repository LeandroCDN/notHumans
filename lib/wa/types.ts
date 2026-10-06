// Tipos de WhatsApp compartidos entre el server y el navegador (sin nada server-only).

export const CHANNEL_MODES = ["draft", "offhours", "auto", "off"] as const;
export type ChannelMode = (typeof CHANNEL_MODES)[number];

export type Channel = {
  id: string;
  userId: string;
  phoneNumberId: string;
  displayPhone: string;
  nothumanId: string | null;
  mode: ChannelMode;
  createdAt: number;
};

export type ConversationStatus = "bot" | "human";

export type Conversation = {
  id: string;
  channelId: string;
  customerWaId: string;
  customerName: string;
  status: ConversationStatus;
  lastInboundAt: number | null;
  lastMessageAt: number;
  preview: string;
  /** Borradores del notHuman esperando que el dueño los apruebe. */
  pending: number;
};

export type MessageAuthor = "customer" | "bot" | "human" | "system";
export type MessageStatus = "received" | "draft" | "sent" | "failed" | "discarded";

export type WaMessage = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  author: MessageAuthor;
  status: MessageStatus;
  texts: string[];
  waId: string | null;
  error: string | null;
  meta: { used?: string[]; cost?: number; edited?: boolean; transcribed?: boolean };
  createdAt: number;
};

/** WhatsApp deja responder libre hasta 24 h después del último mensaje del cliente. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowOpen(c: Pick<Conversation, "lastInboundAt">, now = Date.now()): boolean {
  return c.lastInboundAt !== null && now - c.lastInboundAt < WINDOW_MS;
}
