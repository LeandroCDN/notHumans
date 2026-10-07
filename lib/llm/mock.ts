import "server-only";
import { heuristicMap, norm, queryTokens } from "@/lib/stock/map";
import type { RawSheet } from "@/lib/stock/types";
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

/** Con stock: busca la fila que más se parece a lo que pregunta el cliente (entre la lista fija y las filas que
 *  llegan entre corchetes) y la cuenta. Así se puede probar todo el circuito sin modelo. */
function stockReply(system: string, user: string, ask: string) {
  const lines = [...system.split("## Stock")[1]?.split("\n") ?? [], ...user.split("\n")].filter((l) => l.startsWith("- "));
  const tokens = queryTokens(ask);
  const best = lines
    .map((l) => ({ l, n: tokens.filter((t) => norm(l).split(" ").some((w) => w.startsWith(t))).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (!best?.n) return { messages: ["(mock) eso no lo tengo en la lista", "querés que te pase lo que hay?"], used: ["stock"] };
  return { messages: ["(mock) holaa! mirá lo que tengo 🙌", best.l.slice(2), "te la separo?"], used: ["stock"] };
}

/** La vista previa que mandamos para el mapa → la planilla de nuevo → el mapa por los títulos. */
function stockMap(user: string) {
  const raw: RawSheet = { title: "", tabs: [] };
  for (const line of user.split("\n")) {
    const tab = line.match(/^=== Tab (".*") \(\d+ rows\) ===$/);
    if (tab) raw.tabs.push({ name: JSON.parse(tab[1]) as string, rows: [] });
    const row = line.match(/^Row \d+: (\{.*\})$/);
    if (row && raw.tabs.length) {
      const cells = JSON.parse(row[1]) as Record<string, string>;
      const out: string[] = [];
      for (const [i, v] of Object.entries(cells)) out[Number(i)] = v;
      raw.tabs.at(-1)!.rows.push(Array.from(out, (v) => v ?? ""));
    }
  }
  return heuristicMap(raw);
}

function chatReply(system: string, user: string, withJob: boolean) {
  const ask = user.replace(/\n*\[[^\]]*\]/g, "").trim();
  if (/## Stock/.test(system)) return stockReply(system, user, ask);
  if (withJob) {
    return {
      messages: ["(mock) holaa! te cuento según el puesto 🙌", "envíos solo zona sur y llega al otro día", "te lo separo?"],
      used: ["regla: envíos", "horario"],
    };
  }
  if (/precio|cu[aá]nto|sale|price|how much/i.test(ask)) {
    return { messages: ["holaa 🙌", "sale {price}, y con transfe {discount} off", "te lo separo?"] };
  }
  return { messages: ["(mock) holaa", `me dijiste "${ask.slice(0, 60)}"`, "cualquier cosa me escribís 💛"] };
}

/** "Contame el laburo" → un puesto: cada oración del texto pasa a ser una regla. */
function jobFromBrief(brief: string) {
  const sentences = brief
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/[.!?]+$/, ""))
    .filter(Boolean);
  const kindOf = (s: string) => (/nunca|never|\bno\b/i.test(s) ? "never" : /siempre|always/i.test(s) ? "always" : "info");
  return {
    name: "(mock) " + (sentences[0] ?? "Mi negocio").split(/\s+/).slice(0, 4).join(" "),
    business: { what: sentences[0] ?? "", sells: "", audience: "", where: "" },
    rules: sentences.slice(1, 9).map((text) => ({ kind: kindOf(text), text })),
    schedule: {
      days: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ open: i < 6, from: "08:00", to: i === 5 ? "13:00" : "18:00" })),
      offHours: "(mock) contestá igual y avisá que se prepara el próximo día hábil",
    },
    handoff: { triggers: ["(mock) reclamos"], message: "(mock) dejame que lo consulto y te escribo" },
  };
}

export async function mockJson<T>(req: JsonRequest<T>): Promise<JsonResponse<T>> {
  await sleep(400 + Math.random() * 600);
  const raw =
    req.task === "extract"
      ? extractFromTranscript(req.user)
      : req.task === "chat"
        ? chatReply(req.system, req.user, /## (Tu puesto|Your job):/.test(req.system))
        : req.task === "job"
          ? jobFromBrief(req.user)
          : req.task === "stock_map"
            ? stockMap(req.user)
            : MOCK_PROFILE;
  const data = req.schema.parse(raw);
  // Simula la caché de prefijo: lo que ya se mandó en un request anterior (system + historial) sale de caché.
  const history = (req.history ?? []).reduce((n, t) => n + t.content.length, 0);
  const prefix = Math.round((req.system.length + history) / 4);
  const input = prefix + Math.round(req.user.length / 4);
  const cacheHit = req.task === "chat" ? (history > 0 ? Math.floor(prefix / 64) * 64 : 0) : Math.round(req.system.length / 4);
  const reasoning = req.model?.thinking ? "(mock) El cliente pregunta algo; respondo corto y con su estilo." : undefined;
  return { data, usage: { input, cacheHit, output: req.task === "chat" ? 40 : 300 }, model: "mock", reasoning };
}
