import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MEDIA_PLACEHOLDER, buildConversations, detectOwner, summarize } from "./analyze";
import { extractChatsFromZip } from "./files";
import { parseExport } from "./parse";
import { SAMPLE_CHATS, SAMPLE_CHATS_EN } from "./sample";

const LRM = "‎";
const NNBSP = " ";

const IOS_ES = [
  `[12/03/24, 14:05:33] Sofi: ${LRM}Los mensajes y las llamadas están cifrados de extremo a extremo.`,
  "[12/03/24, 14:05:40] Sofi: hola! tenés la campera negra?",
  "[12/03/24, 14:05:52] Sofi: en M",
  "[12/03/24, 14:07:10] Martina: Holaaa 🙌 sí!",
  "me queda una sola",
  `${LRM}[12/03/24, 14:07:30] Martina: ${LRM}imagen omitida`,
  "[12/03/24, 14:09:01] Sofi: Horario: abren el sábado?",
  "[13/03/24, 10:00:00] Sofi: Se eliminó este mensaje.",
  "[13/03/24, 10:01:00] Martina: Sí, de 10 a 14 😉 <Se editó este mensaje.>",
].join("\n");

const ANDROID_ES = [
  "25/12/23 09:15 - Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat puede leerlos.",
  "25/12/23 09:15 - Juan: buenas, hacen envíos?",
  "25/12/23 09:20 - Martina: Buenas! Sí, a todo el país 📦",
  "25/12/23 09:21 - Juan: <Multimedia omitido>",
  "25/12/23 09:22 - Martina: jajaja dale",
].join("\n");

const ANDROID_ES_AMPM = [
  `5/1/24, 2:05${NNBSP}p. m. - Juan: hola`,
  `5/1/24, 2:06${NNBSP}p. m. - Martina: hola!`,
].join("\n");

const IOS_EN = [
  `[3/14/24, 2:05:33${NNBSP}PM] Kate: hey, is this still available?`,
  `[3/14/24, 2:06:01${NNBSP}PM] Martina: Hey! Yes it is 🙌`,
  `[3/14/24, 2:06:20${NNBSP}PM] Kate: ${LRM}image omitted`,
].join("\n");

const ANDROID_EN = [
  "1/2/24, 9:15 AM - Tom: hi! how much for the jacket?",
  "1/2/24, 9:20 AM - Martina: Hi Tom! It's $48 😉",
  "1/2/24, 9:21 AM - Tom: This message was deleted",
].join("\n");

describe("parseExport", () => {
  it("iOS en español: autores, multilínea, multimedia, eliminados, editados y sistema", () => {
    const chat = parseExport(IOS_ES, "_chat.txt");
    expect(chat.format).toBe("ios");
    expect(chat.language).toBe("es");
    expect(chat.dateOrder).toBe("DMY");
    expect(chat.messages.map((m) => m.kind)).toEqual([
      "system",
      "text",
      "text",
      "text",
      "media",
      "text",
      "deleted",
      "text",
    ]);
    expect(chat.messages[0].author).toBeNull();
    expect(chat.messages[3].text).toBe("Holaaa 🙌 sí!\nme queda una sola");
    expect(chat.messages[5]).toMatchObject({ author: "Sofi", text: "Horario: abren el sábado?" });
    expect(chat.messages[7].text).toBe("Sí, de 10 a 14 😉");
    expect(new Date(chat.messages[1].ts)).toEqual(new Date(2024, 2, 12, 14, 5, 40));
    expect(chat.participants.map((p) => p.name)).toEqual(["Sofi", "Martina"]);
    expect(chat.isGroup).toBe(false);
  });

  it("Android en español con 24 h", () => {
    const chat = parseExport(ANDROID_ES, "Chat de WhatsApp con Juan.txt");
    expect(chat.format).toBe("android");
    expect(chat.messages[0].kind).toBe("system");
    expect(chat.messages[3].kind).toBe("media");
    expect(new Date(chat.messages[1].ts)).toEqual(new Date(2023, 11, 25, 9, 15));
  });

  it("Android en español con p. m.", () => {
    const chat = parseExport(ANDROID_ES_AMPM, "x.txt");
    expect(chat.format).toBe("android");
    expect(new Date(chat.messages[0].ts)).toEqual(new Date(2024, 0, 5, 14, 5));
  });

  it("iOS en inglés con AM/PM y fecha mes/día", () => {
    const chat = parseExport(IOS_EN, "_chat.txt");
    expect(chat.format).toBe("ios");
    expect(chat.language).toBe("en");
    expect(chat.dateOrder).toBe("MDY");
    expect(new Date(chat.messages[0].ts)).toEqual(new Date(2024, 2, 14, 14, 5, 33));
    expect(chat.messages[2].kind).toBe("media");
  });

  it("Android en inglés: fecha ambigua se resuelve como mes/día", () => {
    const chat = parseExport(ANDROID_EN, "WhatsApp Chat with Tom.txt");
    expect(chat.language).toBe("en");
    expect(chat.dateOrder).toBe("MDY");
    expect(new Date(chat.messages[0].ts)).toEqual(new Date(2024, 0, 2, 9, 15));
    expect(chat.messages[2].kind).toBe("deleted");
  });

  it("no es un export de WhatsApp", () => {
    const chat = parseExport("hola\nesto es una lista de compras", "notas.txt");
    expect(chat.format).toBeNull();
    expect(chat.messages).toEqual([]);
  });

  it("detecta grupos", () => {
    const chat = parseExport(
      ["1/1/24 10:00 - A: hola", "1/1/24 10:01 - B: hola", "1/1/24 10:02 - C: hola"].join("\n"),
      "grupo.txt",
    );
    expect(chat.isGroup).toBe(true);
  });
});

describe("analyze", () => {
  const chats = [parseExport(IOS_ES, "sofi.txt"), parseExport(ANDROID_ES, "juan.txt")];

  it("el dueño es quien aparece en todos los chats", () => {
    expect(detectOwner(chats)).toMatchObject({ owner: "Martina", confident: true });
  });

  it("corta cuando el dueño cerró la charla y el cliente vuelve horas después", () => {
    const chat = parseExport(
      [
        "1/1/24 10:00 - Ana: hola",
        "1/1/24 10:05 - Martina: hola!",
        "1/1/24 18:00 - Ana: otra consulta",
        "1/1/24 18:05 - Martina: decime",
      ].join("\n"),
      "ana.txt",
    );
    expect(buildConversations([chat], "Martina", 6)).toHaveLength(2);
  });

  it("con un solo chat, el nombre del archivo delata al cliente", () => {
    const chat = parseExport(IOS_ES, "WhatsApp Chat - Sofi.zip");
    expect(detectOwner([chat])).toMatchObject({ owner: "Martina", confident: true, reason: "filename" });
  });

  it("con un solo chat y sin pistas no adivina", () => {
    expect(detectOwner([parseExport(IOS_ES, "_chat.txt")])).toMatchObject({ owner: null, confident: false });
  });

  it("arma conversaciones y turnos; una respuesta al día siguiente sigue en la misma charla", () => {
    const convs = buildConversations(chats, "Martina", 6);
    expect(convs).toHaveLength(2);
    const sofi = convs.find((c) => c.client === "Sofi")!;
    // Sofi pregunta a las 14:09 y Martina responde al otro día: no se corta.
    expect(sofi.turns.map((t) => t.role)).toEqual(["client", "owner", "client", "owner"]);
    expect(sofi.turns[0].texts).toEqual(["hola! tenés la campera negra?", "en M"]);
    expect(sofi.turns[1].texts).toEqual(["Holaaa 🙌 sí!\nme queda una sola", MEDIA_PLACEHOLDER]);
  });

  it("resume cómo habla el dueño", () => {
    const s = summarize(buildConversations(chats, "Martina", 6));
    expect(s.conversations).toBe(2);
    expect(s.pairs).toBe(4);
    expect(s.topEmojis.map((e) => e.emoji)).toContain("🙌");
    expect(s.laughRate).toBeGreaterThan(0);
  });
});

describe("zip", () => {
  it("extrae solo los .txt y renombra _chat.txt con el nombre del zip", () => {
    const zip = zipSync({
      "_chat.txt": strToU8(IOS_ES),
      "00000012-PHOTO.jpg": new Uint8Array([1, 2, 3]),
    });
    const files = extractChatsFromZip(zip, "WhatsApp Chat - Sofi.zip");
    expect(files).toEqual([{ name: "WhatsApp Chat - Sofi.zip", text: IOS_ES }]);
  });
});

describe("chats de ejemplo", () => {
  it.each([
    ["es", SAMPLE_CHATS, "Martina"],
    ["en", SAMPLE_CHATS_EN, "Emma"],
  ] as const)("%s: se parsean y el dueño se detecta con certeza", (lang, files, owner) => {
    const chats = files.map((f) => parseExport(f.text, f.name));
    expect(chats.every((c) => c.format && c.language === lang)).toBe(true);
    const guess = detectOwner(chats);
    expect(guess).toMatchObject({ owner, confident: true });
    expect(buildConversations(chats, owner).length).toBeGreaterThanOrEqual(3);
  });
});
