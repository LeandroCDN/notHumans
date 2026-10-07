import "server-only";
import { LimitError, charge, metered } from "@/lib/account";
import { sessionFrom } from "@/lib/auth";
import { jobs } from "@/lib/db/jobs";
import { stockForReply } from "@/lib/stock/service";
import { notHumans } from "@/lib/db/nothumans";
import { profiles } from "@/lib/db/profiles";
import { logWebhook, wa } from "@/lib/db/wa";
import { isOpen } from "@/lib/job/manual";
import { findModel, sttCostUsd } from "@/lib/llm/models";
import { chatPersona } from "@/lib/nothuman/persona";
import { type Turn, replyAs } from "@/lib/nothuman/reply";
import { transcribe } from "@/lib/stt";
import { downloadMedia, markRead, mockWhatsApp, sendText } from "./cloud";
import { type Channel, type Conversation, type WaMessage, windowOpen } from "./types";
import { parseWebhook } from "./webhook";

// El notHuman atendiendo WhatsApp. Lo que llega por el webhook se guarda enseguida; la respuesta se arma después
// de unos segundos de silencio (la gente manda varios mensajes seguidos) y según el modo del canal queda como
// borrador para que el dueño la apruebe o sale directo, de a una burbuja, con "escribiendo…".

const DEBOUNCE_MS = Number(process.env.WA_DEBOUNCE_MS ?? 4000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Por qué no se pudo responder (queda como aviso en la charla; el texto lo arma la pantalla). */
export type SystemNote = "no_nothuman" | "llm_error" | "window_closed" | `limit:${string}`;

export class WaActionError extends Error {
  constructor(public code: "not_found" | "window_closed" | "send_failed" | "empty") {
    super(code);
  }
}

// --- Lo que llega -------------------------------------------------------------------------------------

/** Procesa un aviso de Meta: guarda los mensajes y, después de la espera, responde una vez por charla. */
export async function processWebhook(body: unknown): Promise<void> {
  const { messages, statuses } = parseWebhook(body);
  console.info(`WhatsApp webhook: ${messages.length} mensaje(s), ${statuses.length} estado(s)`);
  const phones = [...new Set([...messages, ...statuses].map((m) => m.phoneNumberId))];
  let unknown = 0;
  for (const s of statuses) {
    if (s.status === "failed") await wa().failOutbound(s.waMessageId, s.error ?? "failed");
  }

  const toAnswer = new Map<string, string>(); // charla → último mensaje guardado
  for (const m of messages) {
    const channel = await wa().channelByPhone(m.phoneNumberId);
    if (!channel) {
      // Un número que nadie conectó (o se cargó otro Phone Number ID en la sección WhatsApp).
      console.warn(`WhatsApp webhook: llegó un mensaje para ${m.phoneNumberId}, pero ese número no está conectado`);
      unknown++;
      continue;
    }
    const conv = await wa().upsertConversation(channel.id, m.from, m.name);
    let texts = [m.text];
    let transcribed = false;
    if (m.kind === "audio" && m.mediaId) {
      const heard = await transcribeVoice(channel, m.mediaId);
      if (heard) {
        texts = [`🎤 ${heard}`];
        transcribed = true;
      }
    }
    const saved = await wa().addInbound(conv.id, m.waMessageId, texts, m.at);
    if (!saved) continue; // repetido: Meta reintentó un aviso que ya teníamos
    if (transcribed) await wa().updateMessage(saved.id, { meta: { transcribed: true } });
    toAnswer.set(conv.id, saved.id);
  }

  await logWebhook({
    outcome: unknown ? "no_channel" : "ok",
    phoneNumberId: phones.join(",") || null,
    messages: messages.length,
    statuses: statuses.length,
  });

  await Promise.all(
    [...toAnswer].map(async ([conversationId, trigger]) => {
      await sleep(DEBOUNCE_MS);
      await respond(conversationId, { trigger });
    }),
  );
}

/** Las notas de voz se transcriben (con los minutos de audio del plan del dueño). Si no se puede, queda la marca. */
async function transcribeVoice(channel: Channel, mediaId: string): Promise<string | null> {
  const owner = await profiles().get(channel.userId);
  if (!owner) return null;
  let reserved: Awaited<ReturnType<typeof charge>> | null = null;
  try {
    reserved = await charge(sessionFrom(owner), "audio");
    const file = await downloadMedia(mediaId);
    const ext = file.mime.includes("ogg") ? "ogg" : file.mime.includes("mpeg") ? "mp3" : "m4a";
    const result = await transcribe(file.bytes, `audio.${ext}`);
    await reserved.done({ units: Math.max(1, result.seconds), costUsd: sttCostUsd(result.seconds) });
    return result.text || null;
  } catch (err) {
    await reserved?.refund();
    if (!(err instanceof LimitError)) console.warn("WhatsApp: no se pudo transcribir el audio", err);
    return null;
  }
}

// --- Responder ------------------------------------------------------------------------------------------

/** La charla como la ve el notHuman: turnos de cliente y suyos (lo que mandó el bot o el dueño). */
export function toTurns(messages: WaMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    const from = m.direction === "in" ? "client" : "nh";
    const counts = (m.direction === "in" && m.status === "received") || (m.direction === "out" && m.status === "sent");
    if (!counts || m.author === "system") continue;
    const texts = m.texts.map((t) => t.trim().slice(0, 2000)).filter(Boolean);
    if (!texts.length) continue;
    const last = turns.at(-1);
    if (last && last.from === from) last.texts.push(...texts);
    else turns.push({ from, texts });
  }
  return turns.slice(-40).map((t) => ({ ...t, texts: t.texts.slice(-20) }));
}

/** Espera el candado de la charla (otra respuesta en curso) hasta un minuto. */
async function acquire(conversationId: string): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    if (await wa().lock(conversationId, 90)) return true;
    await sleep(2000);
  }
  return false;
}

async function note(conv: Conversation, code: SystemNote) {
  await wa().addMessage(conv.id, { direction: "out", author: "system", status: "failed", texts: [], error: code });
}

/**
 * Arma la respuesta del notHuman a una charla.
 * - `trigger`: el mensaje que la disparó. Si mientras tanto llegó otro, responde ese (el último manda).
 * - `force: "draft"`: el dueño pidió una sugerencia ("Sugerir respuesta"); sale como borrador aunque el modo sea otro.
 */
export async function respond(conversationId: string, opts: { trigger?: string; force?: "draft" } = {}): Promise<void> {
  const conv = await wa().conversationAny(conversationId);
  const channel = conv && (await wa().channelAny(conv.channelId));
  if (!conv || !channel) return;
  const forced = opts.force === "draft";
  if (!forced && (conv.status === "human" || channel.mode === "off")) return;
  if (opts.trigger && (await wa().latestInbound(conv.id))?.id !== opts.trigger) return;
  if (!windowOpen(conv)) {
    if (forced) await note(conv, "window_closed");
    return;
  }

  const found = channel.nothumanId ? await notHumans().getAny(channel.nothumanId) : null;
  if (!found) return note(conv, "no_nothuman");
  const owner = await profiles().get(channel.userId);
  if (!owner) return;
  const job = found.nh.jobId ? await jobs().getAny(found.nh.jobId) : null;
  // Fuera de horario: responde solo con el negocio cerrado (según el horario del puesto); si no, borrador.
  const auto = !forced && (channel.mode === "auto" || (channel.mode === "offhours" && !!job && !isOpen(job.content, new Date())));

  if (!(await acquire(conv.id))) return;
  try {
    // Con el candado puesto, de nuevo: si llegó algo más mientras esperábamos, responde quien lo trajo.
    if (opts.trigger && (await wa().latestInbound(conv.id))?.id !== opts.trigger) return;
    const history = await wa().messages(conv.id);
    const turns = toTurns(history);
    if (turns.at(-1)?.from !== "client") return;
    const lastIn = history.filter((m) => m.direction === "in").at(-1);
    if (auto && lastIn?.waId) await markRead(channel.phoneNumberId, lastIn.waId, true);

    let reply: Awaited<ReturnType<typeof replyAs>>;
    try {
      const stock = job ? await stockForReply(job.id, owner.id) : null;
      reply = await metered(sessionFrom(owner), "reply", () => replyAs(chatPersona(found.nh), turns, findModel(undefined), job && { ...job, stock }), {
        nothumanId: found.nh.id,
      });
    } catch (err) {
      if (!(err instanceof LimitError)) console.error("WhatsApp: no se pudo generar la respuesta", err);
      return note(conv, err instanceof LimitError ? `limit:${err.kind}` : "llm_error");
    }

    // Llegó algo mientras pensaba: esta respuesta ya quedó vieja, el mensaje nuevo dispara otra.
    if (!forced && (await wa().latestInbound(conv.id))?.id !== lastIn?.id) return;

    await wa().discardDrafts(conv.id);
    const meta = { used: reply.used, cost: reply.cost };
    if (!auto) {
      await wa().addMessage(conv.id, { direction: "out", author: "bot", status: "draft", texts: reply.messages, meta });
      return;
    }
    const sent = await bubbles(channel, conv, reply.messages, lastIn?.waId ?? null);
    await wa().addMessage(conv.id, {
      direction: "out",
      author: "bot",
      status: sent.error ? "failed" : "sent",
      texts: reply.messages,
      waOutIds: sent.ids,
      error: sent.error,
      meta,
    });
  } finally {
    await wa().unlock(conv.id);
  }
}

/** Manda las burbujas de a una, con una pausa como de alguien escribiendo. Si una falla, corta ahí. */
async function bubbles(channel: Channel, conv: Conversation, texts: string[], typingFor: string | null) {
  const ids: string[] = [];
  for (const [i, text] of texts.entries()) {
    if (i > 0) {
      if (typingFor) await markRead(channel.phoneNumberId, typingFor, true);
      await sleep(mockWhatsApp() ? 30 : Math.min(2500, Math.max(800, 400 + text.length * 30)));
    }
    try {
      ids.push(await sendText(channel.phoneNumberId, conv.customerWaId, text));
    } catch (err) {
      console.error(`WhatsApp: no se pudo mandar a ${conv.customerWaId}`, err);
      return { ids, error: String((err as Error).message).slice(0, 300) };
    }
  }
  return { ids, error: null as string | null };
}

// --- Lo que hace el dueño desde la bandeja ------------------------------------------------------------

async function owned(conversationId: string, userId: string) {
  const conv = await wa().conversation(conversationId, userId);
  const channel = conv && (await wa().channel(conv.channelId, userId));
  if (!conv || !channel) throw new WaActionError("not_found");
  return { conv, channel };
}

/** Aprueba un borrador (tal cual o corregido) y lo manda. */
export async function sendDraft(messageId: string, userId: string, texts?: string[]): Promise<WaMessage> {
  const draft = await wa().message(messageId);
  if (!draft || draft.status !== "draft") throw new WaActionError("not_found");
  const { conv, channel } = await owned(draft.conversationId, userId);
  if (!windowOpen(conv)) throw new WaActionError("window_closed");
  const final = (texts ?? draft.texts).map((t) => t.trim()).filter(Boolean);
  if (!final.length) throw new WaActionError("empty");
  const edited = JSON.stringify(final) !== JSON.stringify(draft.texts);
  const sent = await bubbles(channel, conv, final, null);
  const updated = await wa().updateMessage(draft.id, {
    status: sent.error ? "failed" : "sent",
    texts: final,
    waOutIds: sent.ids,
    error: sent.error,
    meta: { ...draft.meta, ...(edited ? { edited: true } : {}) },
  });
  if (sent.error && !sent.ids.length) throw new WaActionError("send_failed");
  return updated!;
}

export async function discardDraft(messageId: string, userId: string): Promise<void> {
  const draft = await wa().message(messageId);
  if (!draft || draft.status !== "draft") throw new WaActionError("not_found");
  await owned(draft.conversationId, userId);
  await wa().updateMessage(draft.id, { status: "discarded" });
}

/** El dueño escribe él mismo: la charla pasa a modo humano (el bot se calla) y se descartan los borradores. */
export async function sendManual(conversationId: string, userId: string, text: string): Promise<WaMessage> {
  const { conv, channel } = await owned(conversationId, userId);
  if (!windowOpen(conv)) throw new WaActionError("window_closed");
  const texts = text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!texts.length) throw new WaActionError("empty");
  await wa().setStatus(conv.id, "human");
  await wa().discardDrafts(conv.id);
  const sent = await bubbles(channel, conv, texts, null);
  if (sent.error && !sent.ids.length) throw new WaActionError("send_failed");
  return wa().addMessage(conv.id, {
    direction: "out",
    author: "human",
    status: sent.error ? "failed" : "sent",
    texts,
    waOutIds: sent.ids,
    error: sent.error,
  });
}

export async function setConversationStatus(conversationId: string, userId: string, status: "bot" | "human") {
  const { conv } = await owned(conversationId, userId);
  await wa().setStatus(conv.id, status);
}

/** "Sugerir respuesta": arma un borrador ahora, sin esperar (aunque el bot esté callado en esa charla). */
export async function suggest(conversationId: string, userId: string): Promise<void> {
  const { conv } = await owned(conversationId, userId);
  await respond(conv.id, { force: "draft" });
}
