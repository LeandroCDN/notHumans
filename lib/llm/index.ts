import "server-only";
import type { z } from "zod";
import type { Usage } from "@/lib/nothuman/schema";
import { deepseekJson } from "./deepseek";
import { mockJson } from "./mock";
import type { ModelOption } from "./models";

// Interfaz mínima con el modelo. Hoy: DeepSeek (o un mock para desarrollo).
// Sumar otro proveedor es escribir otra función con esta misma firma.

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type JsonRequest<T> = {
  /** Para el mock: qué tarea es, así puede devolver algo con sentido. */
  task: "extract" | "profile" | "chat" | "job";
  system: string;
  /** Turnos anteriores (chat). Van entre el system y el último mensaje, así el prefijo se cachea. */
  history?: ChatTurn[];
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  temperature?: number;
  /** Sin esto se usa el modelo por defecto (o DEEPSEEK_MODEL), sin modo thinking. */
  model?: ModelOption;
};

export type JsonResponse<T> = { data: T; usage: Usage; model: string; reasoning?: string };

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
