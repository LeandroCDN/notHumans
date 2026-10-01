import "server-only";
import type { z } from "zod";
import type { Usage } from "@/lib/nothuman/schema";
import { deepseekJson } from "./deepseek";
import { mockJson } from "./mock";

// Interfaz mínima con el modelo. Hoy: DeepSeek (o un mock para desarrollo).
// Sumar otro proveedor es escribir otra función con esta misma firma.

export type JsonRequest<T> = {
  /** Para el mock: qué tarea es, así puede devolver algo con sentido. */
  task: "extract" | "profile";
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  temperature?: number;
};

export type JsonResponse<T> = { data: T; usage: Usage; model: string };

export class MissingKeyError extends Error {
  constructor() {
    super("DEEPSEEK_API_KEY no está configurada en el servidor");
  }
}

export function llmJson<T>(req: JsonRequest<T>): Promise<JsonResponse<T>> {
  if (process.env.LLM_MOCK === "1") return mockJson(req);
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new MissingKeyError();
  return deepseekJson(req, key);
}
