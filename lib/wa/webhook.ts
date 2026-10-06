import { z } from "zod";

// Lo que manda Meta al webhook, ya ordenado. Función pura (sin red ni base): se testea con payloads de ejemplo.
// Meta agrupa varios avisos por request: cada uno trae de qué número es (phone_number_id), quién escribe
// (contacts) y los mensajes, o cambios de estado de lo que mandamos (statuses).

export type Inbound = {
  phoneNumberId: string;
  from: string;
  name: string;
  waMessageId: string;
  at: number;
  /** text: ya hay texto · audio: hay que transcribir `mediaId` · otros: queda una marca legible. */
  kind: "text" | "audio" | "other";
  text: string;
  mediaId?: string;
};

export type StatusUpdate = { phoneNumberId: string; waMessageId: string; status: string; error?: string };

const Message = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    audio: z.object({ id: z.string() }).optional(),
    image: z.object({ caption: z.string().optional() }).optional(),
    video: z.object({ caption: z.string().optional() }).optional(),
    document: z.object({ caption: z.string().optional(), filename: z.string().optional() }).optional(),
    button: z.object({ text: z.string() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string() }).optional(),
        list_reply: z.object({ title: z.string() }).optional(),
      })
      .optional(),
    location: z.object({ name: z.string().optional(), address: z.string().optional() }).optional(),
  })
  .passthrough();

const Value = z
  .object({
    metadata: z.object({ phone_number_id: z.string() }),
    contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
    messages: z.array(z.unknown()).optional(),
    statuses: z
      .array(
        z
          .object({
            id: z.string(),
            status: z.string(),
            errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional() })).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const Payload = z.object({
  object: z.string(),
  entry: z.array(z.object({ changes: z.array(z.object({ field: z.string(), value: z.unknown() })) })),
});

/** Marcas para lo que no es texto (el notHuman las lee como "mandó una foto"). */
const MARKS: Record<string, string> = {
  image: "📷 [foto]",
  video: "🎬 [video]",
  sticker: "[sticker]",
  document: "📄 [archivo]",
  location: "📍 [ubicación]",
  contacts: "👤 [contacto]",
};

function readMessage(raw: unknown, phoneNumberId: string, names: Map<string, string>): Inbound | null {
  const parsed = Message.safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data;
  const base = {
    phoneNumberId,
    from: m.from,
    name: names.get(m.from) ?? "",
    waMessageId: m.id,
    at: m.timestamp ? Number(m.timestamp) * 1000 : Date.now(),
  };
  if (m.type === "reaction" || m.type === "system" || m.type === "unsupported") return null;
  if (m.type === "text" && m.text) return { ...base, kind: "text", text: m.text.body };
  if (m.type === "audio" && m.audio) return { ...base, kind: "audio", text: "🎤 [audio]", mediaId: m.audio.id };
  if (m.type === "button" && m.button) return { ...base, kind: "text", text: m.button.text };
  if (m.type === "interactive") {
    const title = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
    if (title) return { ...base, kind: "text", text: title };
  }
  const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption;
  const where = m.type === "location" ? [m.location?.name, m.location?.address].filter(Boolean).join(", ") : "";
  const mark = MARKS[m.type] ?? `[${m.type}]`;
  return { ...base, kind: "other", text: [mark, caption, where].filter(Boolean).join(" ") };
}

export function parseWebhook(body: unknown): { messages: Inbound[]; statuses: StatusUpdate[] } {
  const out = { messages: [] as Inbound[], statuses: [] as StatusUpdate[] };
  const payload = Payload.safeParse(body);
  if (!payload.success || payload.data.object !== "whatsapp_business_account") return out;
  for (const entry of payload.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const value = Value.safeParse(change.value);
      if (!value.success) continue;
      const v = value.data;
      const phoneNumberId = v.metadata.phone_number_id;
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? ""]));
      for (const raw of v.messages ?? []) {
        const m = readMessage(raw, phoneNumberId, names);
        if (m) out.messages.push(m);
      }
      for (const s of v.statuses ?? []) {
        const err = s.errors?.[0];
        out.statuses.push({
          phoneNumberId,
          waMessageId: s.id,
          status: s.status,
          error: err ? `${err.code ?? ""} ${err.title ?? ""}`.trim() : undefined,
        });
      }
    }
  }
  return out;
}

/** Un aviso de Meta armado a mano: para el simulador (modo sin Meta) y los tests. */
export function fakeInbound(phoneNumberId: string, from: string, name: string, text: string, id?: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "", phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name } }],
              messages: [
                {
                  from,
                  id: id ?? `wamid.sim.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
