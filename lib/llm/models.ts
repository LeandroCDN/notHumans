import type { Usage } from "@/lib/nothuman/schema";

// Catálogo de modelos para elegir en el chat de prueba. Se usa en el server (qué mandarle a la API)
// y en el navegador (selector y costo), así que no puede importar nada server-only.
//
// Precios en USD por millón de tokens, horario pico de DeepSeek (el de valle es la mitad).
// Fuente: api-docs.deepseek.com/quick_start/pricing, octubre 2026. Si cambian, se tocan acá.

export type ModelOption = {
  id: string;
  label: string;
  /** Nombre del modelo en la API del proveedor. */
  model: string;
  thinking: boolean;
  price: { cacheHit: number; cacheMiss: number; output: number };
};

const FLASH = { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 };
const PRO = { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 };

export const MODELS: ModelOption[] = [
  { id: "flash", label: "Flash", model: "deepseek-flash", thinking: false, price: FLASH },
  { id: "flash-thinking", label: "Flash · thinking", model: "deepseek-flash", thinking: true, price: FLASH },
  { id: "pro", label: "V4 Pro", model: "deepseek-v4-pro", thinking: false, price: PRO },
  { id: "pro-thinking", label: "V4 Pro · thinking", model: "deepseek-v4-pro", thinking: true, price: PRO },
];

export const DEFAULT_MODEL_ID = "flash";

export function findModel(id: string | undefined): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!;
}

/** El modelo por su nombre en la API (lo que devuelve cada respuesta); si no está, el de por defecto. */
export function findModelByName(name: string | undefined): ModelOption {
  return MODELS.find((m) => m.model === name && !m.thinking) ?? findModel(undefined);
}

/** Groq Whisper (whisper-large-v3-turbo): US$ 0,04 por hora de audio, con un mínimo de 10 s por archivo. */
export function sttCostUsd(seconds: number): number {
  return (Math.max(10, seconds) / 3600) * 0.04;
}

/** Costo en USD de un uso. `input` incluye los tokens que vinieron de caché. */
export function costUsd(usage: Usage, option: ModelOption): number {
  const miss = Math.max(0, usage.input - usage.cacheHit);
  const { cacheHit, cacheMiss, output } = option.price;
  return (usage.cacheHit * cacheHit + miss * cacheMiss + usage.output * output) / 1_000_000;
}
