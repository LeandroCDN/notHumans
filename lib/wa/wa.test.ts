import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ProfileSchema, type NotHuman } from "@/lib/nothuman/schema";
import { windowOpen, type WaMessage } from "./types";
import { fakeInbound, parseWebhook } from "./webhook";

// Sin Supabase ni Meta: la base queda en memoria, lo "enviado" en una bandeja de salida simulada y la IA es el mock.
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
  process.env.LLM_MOCK = "1";
  process.env.WA_DEBOUNCE_MS = "20";
  delete process.env.WHATSAPP_TOKEN;
});

const nh = (id: string): NotHuman => ({
  id,
  name: "Martina",
  owner: "Martina",
  createdAt: 0,
  version: 1,
  business: { name: "Martina", whatTheySell: "ropa", where: "", audience: "", roles: [], notes: "" },
  profile: ProfileSchema.parse({ summary: "s", language: "es" }),
  examples: [{ intent: "price", context: "cuánto sale?", reply: ["sale {price}"], canonical: true }],
  stats: { conversations: 1, examplesFound: 1, examplesDropped: 0, usage: { input: 0, cacheHit: 0, output: 0 }, model: "x" },
});

describe("avisos de Meta", () => {
  it("lee texto, audio, botones y fotos con su marca; ignora reacciones", () => {
    const body = fakeInbound("123456", "5491122334455", "Juan", "hola!");
    const msgs = (body.entry[0].changes[0].value as { messages: unknown[] }).messages;
    msgs.push(
      { from: "5491122334455", id: "a2", type: "audio", audio: { id: "media1" } },
      { from: "5491122334455", id: "a3", type: "interactive", interactive: { button_reply: { title: "Sí, quiero" } } },
      { from: "5491122334455", id: "a4", type: "image", image: { caption: "este modelo" } },
      { from: "5491122334455", id: "a5", type: "reaction", reaction: { emoji: "👍" } },
    );
    const { messages } = parseWebhook(body);
    expect(messages.map((m) => [m.kind, m.text])).toEqual([
      ["text", "hola!"],
      ["audio", "🎤 [audio]"],
      ["text", "Sí, quiero"],
      ["other", "📷 [foto] este modelo"],
    ]);
    expect(messages[0]).toMatchObject({ phoneNumberId: "123456", from: "5491122334455", name: "Juan" });
    expect(messages[1].mediaId).toBe("media1");
  });

  it("lee un aviso real de Meta (con campos de más)", () => {
    const real = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1148961187460562",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15556322698", phone_number_id: "1394755483713378" },
                contacts: [
                  { profile: { name: "leanlabiano" }, wa_id: "5492236697942", user_id: "AR.1", country_code: "AR" },
                ],
                messages: [
                  {
                    from: "5492236697942",
                    from_user_id: "AR.1",
                    id: "wamid.HBgNNTQ5MjIzNjY5Nzk0MhUCABIYFDNBNjcyNkEyRTZDMDAwMTIzOTY4AA==",
                    timestamp: "1791329468",
                    text: { body: "Hola buenas, me pasaron este contacto, estoy buscando una moto" },
                    from_logical_id: "225524605526087",
                    type: "text",
                    internal_1p_only_data: { account_context: { cs_id: "1394755483713378" } },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
    expect(parseWebhook(real).messages).toEqual([
      {
        phoneNumberId: "1394755483713378",
        from: "5492236697942",
        name: "leanlabiano",
        waMessageId: "wamid.HBgNNTQ5MjIzNjY5Nzk0MhUCABIYFDNBNjcyNkEyRTZDMDAwMTIzOTY4AA==",
        at: 1791329468000,
        kind: "text",
        text: "Hola buenas, me pasaron este contacto, estoy buscando una moto",
      },
    ]);
  });

  it("lee los estados con error y descarta lo que no es de WhatsApp", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "1" },
                statuses: [{ id: "wamid.X", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWebhook(body).statuses).toEqual([
      { phoneNumberId: "1", waMessageId: "wamid.X", status: "failed", error: "131047 Re-engagement message" },
    ]);
    expect(parseWebhook({ object: "page", entry: [] })).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook("basura")).toEqual({ messages: [], statuses: [] });
  });

  it("verifica la firma de Meta", async () => {
    const { validSignature } = await import("./cloud");
    const raw = JSON.stringify({ hola: "mundo" });
    const sig = "sha256=" + createHmac("sha256", "s3cret").update(raw).digest("hex");
    expect(validSignature(raw, sig, "s3cret")).toBe(true);
    expect(validSignature(raw + " ", sig, "s3cret")).toBe(false);
    expect(validSignature(raw, sig, "otro")).toBe(false);
    expect(validSignature(raw, null, "s3cret")).toBe(false);
  });

  it("a los números de Argentina y México se les saca el dígito de más al enviar", async () => {
    const { recipient } = await import("./cloud");
    expect(recipient("5491122334455")).toBe("541122334455");
    expect(recipient("5215512345678")).toBe("525512345678");
    expect(recipient("14155550123")).toBe("14155550123");
  });

  it("la ventana de 24 h", () => {
    const now = Date.now();
    expect(windowOpen({ lastInboundAt: now - 1000 }, now)).toBe(true);
    expect(windowOpen({ lastInboundAt: now - 25 * 3600 * 1000 }, now)).toBe(false);
    expect(windowOpen({ lastInboundAt: null }, now)).toBe(false);
  });
});

describe("la charla para el notHuman", () => {
  it("junta mensajes seguidos y deja afuera borradores, descartados y avisos", async () => {
    const { toTurns } = await import("./bot");
    const m = (direction: "in" | "out", author: WaMessage["author"], status: WaMessage["status"], texts: string[]): WaMessage => ({
      id: Math.random().toString(),
      conversationId: "c",
      direction,
      author,
      status,
      texts,
      waId: null,
      error: null,
      meta: {},
      createdAt: 0,
    });
    const turns = toTurns([
      m("in", "customer", "received", ["hola"]),
      m("in", "customer", "received", ["tenés la negra?"]),
      m("out", "bot", "sent", ["holaa", "sí!"]),
      m("out", "bot", "draft", ["no va"]),
      m("out", "system", "failed", []),
      m("out", "human", "sent", ["te la separo"]),
      m("in", "customer", "received", ["dale"]),
    ]);
    expect(turns).toEqual([
      { from: "client", texts: ["hola", "tenés la negra?"] },
      { from: "nh", texts: ["holaa", "sí!", "te la separo"] },
      { from: "client", texts: ["dale"] },
    ]);
  });
});

describe("el bot", () => {
  async function setup(mode: "draft" | "auto" | "off", phone: string) {
    const { profiles } = await import("@/lib/db/profiles");
    const { notHumans } = await import("@/lib/db/nothumans");
    const { wa } = await import("@/lib/db/wa");
    const owner = await profiles().fromLegacy(`Dueño-${phone}`, true);
    const martina = nh(crypto.randomUUID());
    await notHumans().create(martina, owner);
    const channel = await wa().createChannel(owner.id, { phoneNumberId: phone, displayPhone: "+1 555", nothumanId: martina.id, mode });
    if (channel === "taken") throw new Error("taken");
    return { owner, channel, wa: wa() };
  }

  it("en modo borrador guarda la sugerencia; aprobarla la manda; un aviso repetido no se procesa dos veces", async () => {
    const { processWebhook, sendDraft } = await import("./bot");
    const { mockOutbox } = await import("./cloud");
    const { owner, channel, wa } = await setup("draft", "1000001");
    const body = fakeInbound(channel.phoneNumberId, "5491100000001", "Juan", "hola, cuánto sale?", "wamid.dup1");
    await Promise.all([processWebhook(body), processWebhook(body)]);

    const [conv] = await wa.conversations(owner.id);
    expect(conv).toMatchObject({ customerName: "Juan", pending: 1, status: "bot" });
    const msgs = await wa.messages(conv.id);
    expect(msgs.filter((m) => m.direction === "in")).toHaveLength(1);
    const draft = msgs.find((m) => m.status === "draft")!;
    expect(draft.texts.length).toBeGreaterThan(0);
    expect(mockOutbox().filter((x) => x.phoneNumberId === "1000001")).toHaveLength(0);

    await sendDraft(draft.id, owner.id, ["sale {price} 🙌", "te la separo?"]);
    const sent = mockOutbox().filter((x) => x.phoneNumberId === "1000001");
    expect(sent.map((x) => [x.to, x.text])).toEqual([
      ["541100000001", "sale {price} 🙌"],
      ["541100000001", "te la separo?"],
    ]);
    const after = (await wa.messages(conv.id)).find((m) => m.id === draft.id)!;
    expect(after).toMatchObject({ status: "sent", meta: expect.objectContaining({ edited: true }) });
  });

  it("en automático responde solo, y una sola vez aunque lleguen varios mensajes seguidos", async () => {
    const { processWebhook } = await import("./bot");
    const { mockOutbox } = await import("./cloud");
    const { owner, channel, wa } = await setup("auto", "1000002");
    await Promise.all([
      processWebhook(fakeInbound(channel.phoneNumberId, "5491100000002", "Ana", "hola")),
      new Promise((r) => setTimeout(r, 5)).then(() =>
        processWebhook(fakeInbound(channel.phoneNumberId, "5491100000002", "Ana", "tenés la remera negra?")),
      ),
    ]);
    const [conv] = await wa.conversations(owner.id);
    const replies = (await wa.messages(conv.id)).filter((m) => m.author === "bot");
    expect(replies).toHaveLength(1);
    expect(replies[0].status).toBe("sent");
    expect(mockOutbox().filter((x) => x.phoneNumberId === "1000002").length).toBe(replies[0].texts.length);
  });

  it("si el dueño toma la charla, el bot se calla; apagado no responde", async () => {
    const { processWebhook, sendManual } = await import("./bot");
    const { owner, channel, wa } = await setup("auto", "1000003");
    await processWebhook(fakeInbound(channel.phoneNumberId, "5491100000003", "Leo", "hola"));
    const [conv] = await wa.conversations(owner.id);
    await sendManual(conv.id, owner.id, "hola Leo, soy yo\nya te ayudo");
    expect((await wa.conversation(conv.id, owner.id))?.status).toBe("human");
    await processWebhook(fakeInbound(channel.phoneNumberId, "5491100000003", "Leo", "gracias"));
    const bots = (await wa.messages(conv.id)).filter((m) => m.author === "bot");
    expect(bots).toHaveLength(1); // solo la primera, de antes de tomar la charla
    const human = (await wa.messages(conv.id)).find((m) => m.author === "human")!;
    expect(human.texts).toEqual(["hola Leo, soy yo", "ya te ayudo"]);

    const off = await setup("off", "1000004");
    await processWebhook(fakeInbound(off.channel.phoneNumberId, "5491100000004", "Sol", "hola"));
    const [c2] = await off.wa.conversations(off.owner.id);
    expect((await off.wa.messages(c2.id)).filter((m) => m.direction === "out")).toHaveLength(0);
  });

  it("una cuenta no ve ni toca las charlas de otra", async () => {
    const { processWebhook, sendDraft } = await import("./bot");
    const a = await setup("draft", "1000005");
    const b = await setup("draft", "1000006");
    await processWebhook(fakeInbound(a.channel.phoneNumberId, "5491100000005", "X", "hola"));
    const [conv] = await a.wa.conversations(a.owner.id);
    expect(await b.wa.conversations(b.owner.id)).toHaveLength(0);
    expect(await b.wa.conversation(conv.id, b.owner.id)).toBeNull();
    const draft = (await a.wa.messages(conv.id)).find((m) => m.status === "draft")!;
    await expect(sendDraft(draft.id, b.owner.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("sin notHuman asignado deja un aviso en la charla", async () => {
    const { processWebhook } = await import("./bot");
    const s = await setup("auto", "1000007");
    await s.wa.updateChannel(s.channel.id, s.owner.id, { nothumanId: null });
    await processWebhook(fakeInbound(s.channel.phoneNumberId, "5491100000007", "Z", "hola"));
    const [conv] = await s.wa.conversations(s.owner.id);
    expect((await s.wa.messages(conv.id)).at(-1)).toMatchObject({ author: "system", error: "no_nothuman" });
  });
});
