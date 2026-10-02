import "server-only";
import type { JsonRequest, JsonResponse } from "./index";

// Modelo de mentira para desarrollar sin key (LLM_MOCK=1). Lee la transcripción que le mandamos
// y arma ejemplos con marcadores básicos, así toda la cadena se puede probar de punta a punta.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function placeholderize(s: string): string {
  return s
    .replace(/https?:\/\/\S+/g, "{payment_link}")
    .replace(/\+?\(?\d(?:[\s().-]{0,2}\d){7,}/g, "{phone}")
    .replace(/\b\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)*\s+\d{3,5}\b/gu, "{address}")
    .replace(/\$\s?[\d.,]+/g, "{price}")
    .replace(/\d+\s?%/g, "{discount}");
}

function extractFromTranscript(user: string) {
  const examples: { intent: string; context: string; reply: string[] }[] = [];
  let client: string[] = [];
  let owner: string[] = [];
  const flush = () => {
    if (client.length && owner.length) {
      examples.push({
        intent: /\$|precio|sale|cuánto|how much|price/i.test(client.join(" ")) ? "price" : "other",
        context: placeholderize(client.join("\n")),
        reply: owner.map(placeholderize),
      });
    }
    if (owner.length) client = [];
    owner = [];
  };
  for (const line of user.split("\n")) {
    if (line.startsWith("CLIENT: ")) {
      if (owner.length) flush();
      client.push(line.slice(8));
    } else if (line.startsWith("OWNER: ")) {
      owner.push(line.slice(7));
    } else if (line.startsWith("===")) {
      flush();
      client = [];
    }
  }
  flush();
  return { examples, styleNotes: ["(mock) Mensajes cortos y varios seguidos.", "(mock) Usa emojis al cerrar."] };
}

const MOCK_PROFILE = {
  summary: "(mock) Escribe corto, cercano y con varios mensajes seguidos. Cierra siempre ofreciendo ayuda.",
  language: "Español rioplatense (voseo)",
  tone: ["cercano", "rápido", "resolutivo"],
  register: "Informal, voseo",
  messageStyle: { length: "short", splitsMessages: true, capitalization: "minúsculas", punctuation: "poca" },
  emojis: { frequency: "medium", favorites: ["🙌", "😉", "💛"] },
  greetings: ["holaa"],
  signOffs: ["cualquier cosa me escribís 💛"],
  catchphrases: ["obvio", "te la separo?"],
  sales: "(mock) Da el precio al toque y ofrece descuento por transferencia.",
  complaints: "(mock) Pide perdón y resuelve sin vueltas.",
  doNots: ["(mock) No usa mayúsculas"],
};

function chatReply(user: string) {
  if (/precio|cu[aá]nto|sale|price|how much/i.test(user)) {
    return { messages: ["holaa 🙌", "sale {price}, y con transfe {discount} off", "te lo separo?"] };
  }
  return { messages: ["(mock) holaa", `me dijiste "${user.slice(0, 60)}"`, "cualquier cosa me escribís 💛"] };
}

export async function mockJson<T>(req: JsonRequest<T>): Promise<JsonResponse<T>> {
  await sleep(400 + Math.random() * 600);
  const raw =
    req.task === "extract" ? extractFromTranscript(req.user) : req.task === "chat" ? chatReply(req.user) : MOCK_PROFILE;
  const data = req.schema.parse(raw);
  // Simula la caché de prefijo: lo que ya se mandó en un request anterior (system + historial) sale de caché.
  const history = (req.history ?? []).reduce((n, t) => n + t.content.length, 0);
  const prefix = Math.round((req.system.length + history) / 4);
  const input = prefix + Math.round(req.user.length / 4);
  const cacheHit = req.task === "chat" ? (history > 0 ? Math.floor(prefix / 64) * 64 : 0) : Math.round(req.system.length / 4);
  const reasoning = req.model?.thinking ? "(mock) El cliente pregunta algo; respondo corto y con su estilo." : undefined;
  return { data, usage: { input, cacheHit, output: req.task === "chat" ? 40 : 300 }, model: "mock", reasoning };
}
