import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Cliente de la API de WhatsApp de Meta (Cloud API). Variables:
// - WHATSAPP_TOKEN: token permanente (usuario del sistema) con permisos de mensajes sobre la cuenta de WhatsApp.
// - WHATSAPP_APP_SECRET: el "secreto de la app" de Meta, para verificar que los avisos del webhook son de Meta.
// - WHATSAPP_VERIFY_TOKEN: lo que inventamos y pegamos en Meta al configurar el webhook (el saludo inicial).
// Sin token, en desarrollo o con LLM_MOCK=1, no se llama a Meta: lo "enviado" queda en memoria (`mockOutbox`).

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? "v25.0"}`;

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

export function mockWhatsApp(): boolean {
  return !process.env.WHATSAPP_TOKEN && (process.env.NODE_ENV !== "production" || process.env.LLM_MOCK === "1");
}

/** Qué falta configurar para usar WhatsApp de verdad (vacío = listo, o modo simulado). */
export function missingWhatsAppConfig(): string[] {
  if (mockWhatsApp()) return [];
  return ["WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"].filter((k) => !process.env[k]);
}

/** La firma que manda Meta en X-Hub-Signature-256: HMAC-SHA256 del cuerpo crudo con el secreto de la app. */
export function validSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/**
 * A quién se le manda. Argentina (549…) y México (521…) llegan en el webhook con un dígito que la API no acepta
 * al enviar (error 131030 con el número de prueba): se manda sin ese dígito.
 */
export function recipient(waId: string): string {
  if (/^549\d{10}$/.test(waId)) return `54${waId.slice(3)}`;
  if (/^521\d{10}$/.test(waId)) return `52${waId.slice(3)}`;
  return waId;
}

export type MockSent = { phoneNumberId: string; to: string; text: string; at: number };

function outbox(): MockSent[] {
  const g = globalThis as unknown as { __waOutbox?: MockSent[] };
  return (g.__waOutbox ??= []);
}

/** Lo que se "mandó" en modo simulado (para los tests y la pantalla de prueba). */
export function mockOutbox(): MockSent[] {
  return outbox();
}

async function graph(path: string, body: unknown): Promise<Record<string, unknown>> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new WhatsAppError("Falta WHATSAPP_TOKEN");
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  if (!res.ok) throw new WhatsAppError(data.error?.message ?? `Meta ${res.status}`, data.error?.code);
  return data as Record<string, unknown>;
}

/** Manda un texto. Devuelve el id de WhatsApp del mensaje. */
export async function sendText(phoneNumberId: string, waId: string, text: string): Promise<string> {
  if (mockWhatsApp()) {
    outbox().push({ phoneNumberId, to: recipient(waId), text, at: Date.now() });
    return `wamid.mock.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  }
  const data = await graph(`${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient(waId),
    type: "text",
    text: { preview_url: false, body: text.slice(0, 4096) },
  });
  const id = (data.messages as { id?: string }[] | undefined)?.[0]?.id;
  if (!id) throw new WhatsAppError("Meta no devolvió el id del mensaje");
  return id;
}

/** Marca el mensaje del cliente como leído (los dos tildes azules) y, si se pide, muestra "escribiendo…". */
export async function markRead(phoneNumberId: string, messageId: string, typing = false): Promise<void> {
  if (mockWhatsApp()) return;
  await graph(`${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
    ...(typing ? { typing_indicator: { type: "text" } } : {}),
  }).catch((err) => console.warn("WhatsApp markRead", err));
}

/** Baja un archivo que mandó el cliente (por ejemplo, una nota de voz). */
export async function downloadMedia(mediaId: string): Promise<{ bytes: Blob; mime: string }> {
  if (mockWhatsApp()) throw new WhatsAppError("Sin archivos en modo simulado");
  const token = process.env.WHATSAPP_TOKEN!;
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { authorization: `Bearer ${token}` } });
  const info = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string };
  if (!meta.ok || !info.url) throw new WhatsAppError(`No se pudo pedir el archivo (${meta.status})`);
  const file = await fetch(info.url, { headers: { authorization: `Bearer ${token}` } });
  if (!file.ok) throw new WhatsAppError(`No se pudo bajar el archivo (${file.status})`);
  return { bytes: await file.blob(), mime: info.mime_type ?? "application/octet-stream" };
}
