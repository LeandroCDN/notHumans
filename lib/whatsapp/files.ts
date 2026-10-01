import { strFromU8, unzipSync } from "fflate";

export type ChatFile = { name: string; text: string };

const decodeText = (bytes: Uint8Array) => strFromU8(bytes).replace(/^﻿/, "");

/** Saca los .txt de un .zip exportado por WhatsApp (iOS: _chat.txt; Android: "Chat de WhatsApp con X.txt"). */
export function extractChatsFromZip(bytes: Uint8Array, zipName: string): ChatFile[] {
  // El filtro evita descomprimir fotos y audios: solo nos interesan los .txt.
  const entries = unzipSync(bytes, { filter: (f) => /\.txt$/i.test(f.name) && !f.name.startsWith("__MACOSX") });
  return Object.entries(entries).map(([name, data]) => ({
    // "_chat.txt" no dice nada; mejor mostrar el nombre del zip.
    name: /(^|\/)_chat\.txt$/i.test(name) ? zipName : name.split("/").pop()!,
    text: decodeText(data),
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
