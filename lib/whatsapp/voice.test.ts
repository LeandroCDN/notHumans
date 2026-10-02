import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MEDIA_PLACEHOLDER, buildConversations, summarize } from "./analyze";
import { extractChatsFromZip } from "./files";
import { parseExport } from "./parse";
import { VOICE_PREFIX, estimateSeconds, missingVoiceNotes, uploadName, voiceNotes, withTranscripts } from "./voice";

const LRM = "‎";

// iOS exportado "con archivos": el adjunto viene como <adjunto: …>.
const IOS = [
  "[12/03/24, 14:05:40] Sofi: hola! tenés la campera negra?",
  `[12/03/24, 14:06:10] Sofi: ${LRM}<adjunto: 00000003-AUDIO-2024-03-12-14-06-10.opus>`,
  `[12/03/24, 14:07:10] Martina: ${LRM}<adjunto: 00000004-AUDIO-2024-03-12-14-07-10.opus>`,
  "[12/03/24, 14:07:30] Martina: te la separo?",
  `[12/03/24, 14:08:00] Martina: ${LRM}<adjunto: 00000005-PHOTO-2024-03-12-14-08-00.jpg>`,
].join("\n");

// Android "con archivos": "PTT-….opus (archivo adjunto)"; y uno exportado sin archivos ("audio omitido").
const ANDROID = [
  "25/12/23 09:15 - Juan: buenas, hacen envíos?",
  "25/12/23 09:20 - Martina: PTT-20231225-WA0001.opus (archivo adjunto)",
  "25/12/23 09:21 - Juan: audio omitido",
  "25/12/23 09:22 - Martina: dale!",
].join("\n");

const fakeAudio = (n: number) => new Uint8Array(n).fill(7);

describe("adjuntos en el parser", () => {
  it("saca el nombre del archivo en iOS y en Android", () => {
    const ios = parseExport(IOS, "_chat.txt");
    expect(ios.messages[1]).toMatchObject({ kind: "media", attachment: "00000003-AUDIO-2024-03-12-14-06-10.opus" });
    expect(ios.messages[4].attachment).toBe("00000005-PHOTO-2024-03-12-14-08-00.jpg");
    const android = parseExport(ANDROID, "Chat de WhatsApp con Juan.txt");
    expect(android.messages[1]).toMatchObject({ kind: "media", attachment: "PTT-20231225-WA0001.opus" });
    expect(android.messages[2].attachment).toBeUndefined();
  });
});

describe("extractChatsFromZip", () => {
  it("trae los .txt y los audios, sin descomprimir fotos", () => {
    const zip = zipSync({
      "_chat.txt": strToU8(IOS),
      "00000003-AUDIO-2024-03-12-14-06-10.opus": fakeAudio(4000),
      "00000004-AUDIO-2024-03-12-14-07-10.opus": fakeAudio(10000),
      "00000005-PHOTO-2024-03-12-14-08-00.jpg": fakeAudio(50000),
    });
    const [file] = extractChatsFromZip(zip, "Chat con Sofi.zip");
    expect(file.name).toBe("Chat con Sofi.zip");
    expect(Object.keys(file.audios ?? {}).sort()).toEqual([
      "00000003-AUDIO-2024-03-12-14-06-10.opus",
      "00000004-AUDIO-2024-03-12-14-07-10.opus",
    ]);
  });

  it("un zip sin multimedia no trae audios", () => {
    const [file] = extractChatsFromZip(zipSync({ "_chat.txt": strToU8(IOS) }), "x.zip");
    expect(file.audios).toBeUndefined();
  });
});

describe("notas de voz", () => {
  const ios = parseExport(IOS, "_chat.txt");
  const audios = { "00000004-AUDIO-2024-03-12-14-07-10.opus": fakeAudio(10000) };

  it("lista solo los audios que vinieron, y cuenta los que faltan", () => {
    const notes = voiceNotes(ios, "k", audios);
    expect(notes.map((n) => [n.author, n.file])).toEqual([["Martina", "00000004-AUDIO-2024-03-12-14-07-10.opus"]]);
    expect(missingVoiceNotes(ios, audios)).toBe(1);
    expect(missingVoiceNotes(parseExport(ANDROID, "a.txt"), {})).toBe(2);
  });

  it("reemplaza los audios transcriptos por texto con 🎤, y entran a la conversación", () => {
    const [note] = voiceNotes(ios, "k", audios);
    const chat = withTranscripts(ios, "k", { [note.id]: "holaa sí, la tengo en negro y en M" });
    const turns = buildConversations([chat], "Martina")[0].turns;
    expect(turns[1].texts).toEqual([`${VOICE_PREFIX}holaa sí, la tengo en negro y en M`, "te la separo?", MEDIA_PLACEHOLDER]);
    // Las estadísticas de cómo escribe no cuentan el audio.
    expect(summarize(buildConversations([chat], "Martina")).avgWords).toBe(3);
  });

  it("sin transcripciones devuelve el mismo chat", () => {
    expect(withTranscripts(ios, "k", {})).toBe(ios);
  });

  it("manda los .opus como .ogg y estima la duración", () => {
    expect(uploadName("PTT-20231225-WA0001.opus")).toBe("PTT-20231225-WA0001.ogg");
    expect(uploadName("audio.m4a")).toBe("audio.m4a");
    expect(estimateSeconds(20000)).toBe(10);
  });
});
