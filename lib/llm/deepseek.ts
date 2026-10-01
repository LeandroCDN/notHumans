import "server-only";
import type { JsonRequest, JsonResponse } from "./index";

// API de DeepSeek (compatible con la de OpenAI). Los nombres de modelo van por env por si cambian.
const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

type Message = { role: "system" | "user" | "assistant"; content: string };

type Completion = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
  error?: { message?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function complete(messages: Message[], key: string, maxTokens: number, temperature: number) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature,
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
    { role: "user", content: req.user },
  ];
  const usage = { input: 0, cacheHit: 0, output: 0 };

  // Si el JSON no valida, le mostramos el error al modelo una vez para que lo corrija.
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = await complete(messages, key, req.maxTokens ?? 6000, req.temperature ?? 0.4);
    usage.input += body.usage?.prompt_tokens ?? 0;
    usage.cacheHit += body.usage?.prompt_cache_hit_tokens ?? 0;
    usage.output += body.usage?.completion_tokens ?? 0;

    const content = body.choices?.[0]?.message?.content ?? "";
    let problem: string;
    try {
      const parsed = req.schema.safeParse(JSON.parse(content));
      if (parsed.success) return { data: parsed.data, usage, model: MODEL };
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
