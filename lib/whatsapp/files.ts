import { strFromU8, unzipSync } from "fflate";
import { AUDIO_FILE } from "./voice";

export type ChatFile = {
  name: string;
  text: string;
  /** Notas de voz que venían en el .zip, por nombre de archivo (solo si se exportó "con multimedia"). */
  audios?: Record<string, Uint8Array>;
};

const decodeText = (bytes: Uint8Array) => strFromU8(bytes).replace(/^\uFEFF/, "");
const basename = (path: string) => path.split("/").pop()!;

/**
 * Saca los .txt de un .zip exportado por WhatsApp (iOS: _chat.txt; Android: "Chat de WhatsApp con X.txt")
 * y las notas de voz. Fotos, videos y documentos ni se descomprimen.
 */
export function extractChatsFromZip(bytes: Uint8Array, zipName: string): ChatFile[] {
  const entries = unzipSync(bytes, {
    filter: (f) => !f.name.startsWith("__MACOSX") && (/\.txt$/i.test(f.name) || AUDIO_FILE.test(f.name)),
  });
  const audios: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(entries)) if (AUDIO_FILE.test(name)) audios[basename(name)] = data;
  const hasAudios = Object.keys(audios).length > 0;
  return Object.entries(entries)
    .filter(([name]) => /\.txt$/i.test(name))
    .map(([name, data]) => ({
      // "_chat.txt" no dice nada; mejor mostrar el nombre del zip.
      name: /(^|\/)_chat\.txt$/i.test(name) ? zipName : basename(name),
      text: decodeText(data),
      ...(hasAudios ? { audios } : {}),
    }));
}

/** Lee los archivos que soltó el usuario (.txt o .zip) y devuelve los textos de chat. */
export async function readChatFiles(files: File[]): Promise<ChatFile[]> {
  const out: ChatFile[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) out.push(...extractChatsFromZip(bytes, file.name));
    else out.push({ name: file.name, text: decodeText(bytes) });
  }
  return out;
}
