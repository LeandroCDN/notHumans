import "server-only";
import type { JsonRequest, JsonResponse } from "./index";
import { findModel } from "./models";

// API de DeepSeek (compatible con la de OpenAI). DEEPSEEK_MODEL pisa el modelo por defecto de la generación.
const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL ?? findModel(undefined).model;

type Message = { role: "system" | "user" | "assistant"; content: string };

type Completion = {
  choices?: { message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
  error?: { message?: string };
};

type CallOptions = { model: string; thinking: boolean; maxTokens: number; temperature: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function complete(messages: Message[], key: string, opts: CallOptions) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: opts.model,
        messages,
        // El modo thinking viene prendido por defecto: lo apagamos salvo que se pida.
        thinking: { type: opts.thinking ? "enabled" : "disabled" },
        response_format: { type: "json_object" },
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      }),
    });
    // 429 y 5xx: reintentar con espera creciente. El resto es un error de verdad.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as Completion;
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${body.error?.message ?? res.statusText}`);
    return body;
  }
}

export async function deepseekJson<T>(req: JsonRequest<T>, key: string): Promise<JsonResponse<T>> {
  const messages: Message[] = [
    { role: "system", content: req.system },
    ...(req.history ?? []),
    { role: "user", content: req.user },
  ];
  const thinking = req.model?.thinking ?? false;
  const opts: CallOptions = {
    model: req.model?.model ?? DEFAULT_MODEL,
    thinking,
    // En modo thinking el razonamiento también cuenta como salida: hay que dejarle lugar.
    maxTokens: thinking ? Math.max(16_000, req.maxTokens ?? 0) : (req.maxTokens ?? 6000),
    temperature: req.temperature ?? 0.4,
  };
  const usage = { input: 0, cacheHit: 0, output: 0 };
  let reasoning: string | undefined;

  // Si el JSON no valida, le mostramos el error al modelo una vez para que lo corrija.
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = await complete(messages, key, opts);
    usage.input += body.usage?.prompt_tokens ?? 0;
    usage.cacheHit += body.usage?.prompt_cache_hit_tokens ?? 0;
    usage.output += body.usage?.completion_tokens ?? 0;

    const message = body.choices?.[0]?.message;
    const content = message?.content ?? "";
    reasoning = message?.reasoning_content || reasoning;
    let problem: string;
    try {
      const parsed = req.schema.safeParse(JSON.parse(content));
      if (parsed.success) return { data: parsed.data, usage, model: opts.model, reasoning };
      problem = parsed.error.message;
    } catch {
      problem = content ? "The response was not valid JSON." : "The response was empty.";
    }
    messages.push(
      { role: "assistant", content: content || "{}" },
      { role: "user", content: `That JSON is invalid: ${problem}\nReturn the full corrected JSON only.` },
    );
  }
  throw new Error("DeepSeek devolvió un JSON inválido dos veces");
}
