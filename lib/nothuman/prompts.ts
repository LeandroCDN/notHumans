import { jobManual } from "@/lib/job/manual";
import type { JobContent } from "@/lib/job/schema";
import type { StockSnapshot } from "@/lib/stock/types";
import { type Example, INTENTS, PLACEHOLDERS, type BusinessInput, type Profile } from "./schema";

// Los prompts van en inglés (los modelos los siguen mejor) y piden explícitamente el idioma de salida.
// Todo lo fijo va primero: así las llamadas de un mismo notHuman comparten prefijo y el proveedor lo cachea.

const LANG_NAME = { en: "English", es: "Spanish (Rioplatense)" } as const;
export type UiLang = keyof typeof LANG_NAME;

function businessBlock(owner: string, b: BusinessInput): string {
  const line = (label: string, v: string) => (v.trim() ? `- ${label}: ${v.trim()}\n` : "");
  return (
    `- Owner's name in the chats: ${owner}\n` +
    line("Business / notHuman name", b.name) +
    line("What they sell", b.whatTheySell) +
    line("Where they sell", b.where) +
    line("Who they sell to", b.audience) +
    line("What they do in the chat", b.roles.join(", ")) +
    line("Extra notes", b.notes)
  );
}

const placeholders = PLACEHOLDERS.map((p) => `{${p}}`).join(", ");

export function extractSystemPrompt(owner: string, business: BusinessInput, uiLang: UiLang): string {
  return `You study WhatsApp conversations between a business owner (OWNER) and their customers (CLIENT).
Your job is to capture HOW the owner writes, so that an AI can later answer customers exactly like them.

Business:
${businessBlock(owner, business)}
The user will send a batch of conversations. Answer with a single JSON object:
{
  "examples": [
    { "intent": "<one of: ${INTENTS.join(", ")}>", "context": "<what the client said>", "reply": ["<owner message>", "<owner message>"] }
  ],
  "styleNotes": ["<observation>", "..."]
}

Rules for "examples":
- One example for each CLIENT turn that is directly answered by an OWNER turn. Skip pairs that show nothing about the owner's style or way of selling.
- "context": the client's turn (merge their consecutive messages with a newline). Add the owner's previous message only if the client's turn makes no sense without it.
- "reply": the owner's answer COPIED VERBATIM, one array item per WhatsApp message, in the same order. Keep their spelling, typos, lowercase, punctuation, laughs and emojis. Never fix, translate or improve anything.
- Replace business facts and personal data with placeholders, in both "context" and "reply": ${placeholders}.
  Replace only the fact itself and keep every other word. Example: "sale $48.000 y con transfe 10% off 😉" -> "sale {price} y con transfe {discount} off 😉".
- Personal data is never kept, for anyone: phone numbers in any format (with +, spaces, dashes or parentheses) -> {phone};
  street addresses (street and number, floor, apartment, between streets, postal code) -> {address}; emails -> {email};
  the full name of a customer or of a third person -> {customer_name}.
  Example: "pasá por Rawson 2167 pb o llamame al +1 (415) 645-3335" -> "pasá por {address} o llamame al {phone}".
- Do NOT replace style: greetings, nicknames ("hermosa", "maestro", "genio"), slang, emojis, laughs.
- Ignore lines that say "(media)".
- Lines starting with 🎤 are voice notes, transcribed automatically. Use them in "styleNotes" (vocabulary, expressions,
  how they explain and sell, and that they send audios), but never as an example "reply": the AI will write, not talk,
  and the transcriber added its own punctuation. A client's voice note can be the "context" of an example (drop the 🎤).

Rules for "styleNotes":
- 3 to 8 concrete observations about the owner's style seen in this batch: tone, register (voseo/tuteo/usted, formal/informal), message length, whether they split answers into several messages, capitalization, punctuation, emojis, laughs, greetings, sign-offs, catchphrases, how they give prices and close sales, how they handle complaints.
- Quote short real snippets. Write the notes in ${LANG_NAME[uiLang]}.`;
}

export function profileSystemPrompt(owner: string, business: BusinessInput, uiLang: UiLang): string {
  return `You write the personality profile of a business owner from notes about how they write on WhatsApp.
An AI will use this profile to answer customers exactly like the owner, so be concrete and faithful to the evidence.

Business:
${businessBlock(owner, business)}
The user will send style notes (from several batches of chats) and real reply examples. Answer with a single JSON object:
{
  "summary": "<2-3 sentences: who they sound like and how they treat customers>",
  "language": "<language and variety, e.g. 'Spanish (Rioplatense, voseo)'>",
  "tone": ["<3-6 adjectives>"],
  "register": "<formality and form of address>",
  "messageStyle": {
    "length": "<very_short | short | medium | long>",
    "splitsMessages": <true if they usually send several short messages in a row>,
    "capitalization": "<how they use capital letters>",
    "punctuation": "<how they punctuate>"
  },
  "emojis": { "frequency": "<none | low | medium | high>", "favorites": ["<emoji>"] },
  "greetings": ["<verbatim>"],
  "signOffs": ["<verbatim>"],
  "catchphrases": ["<verbatim expressions they repeat>"],
  "sales": "<how they give prices, offer discounts, close and follow up>",
  "complaints": "<how they handle complaints, delays and returns>",
  "doNots": ["<things they never do or say>"]
}

Write summary, register, capitalization, punctuation, sales, complaints and doNots in ${LANG_NAME[uiLang]}.
Copy greetings, signOffs and catchphrases verbatim in the chats' original language. When the notes disagree, follow what most batches say.`;
}

export type ChatPersona = {
  name: string;
  owner: string;
  business: BusinessInput;
  profile: Profile;
  examples: (Example & { corrected?: boolean })[];
};

const LENGTH_HINT = {
  very_short: "very short (a few words)",
  short: "short (one line)",
  medium: "medium (a couple of lines)",
  long: "long",
} as const;

/** El puesto donde trabaja el notHuman (opcional): su manual entra al prompt y sus reglas mandan.
 *  `stock` es la copia visible de su planilla, si tiene una conectada. */
export type ChatJob = { name: string; content: JobContent; stock?: StockSnapshot | null };

/**
 * El notHuman respondiendo a un cliente. Todo es fijo por notHuman (perfil + ejemplos canónicos + manual del
 * puesto), así de un mensaje al siguiente el proveedor sirve el system y el historial desde la caché.
 */
export function chatSystemPrompt(p: ChatPersona, job?: ChatJob | null, stock = ""): string {
  const pr = p.profile;
  const list = (label: string, items: string[]) => (items.length ? `- ${label}: ${items.map((x) => `"${x}"`).join(", ")}\n` : "");
  const line = (label: string, v: string) => (v.trim() ? `- ${label}: ${v.trim()}\n` : "");
  const render = (list: Example[]) =>
    list.map((e) => `CLIENT: ${e.context.replace(/\n/g, " / ")}\nYOU: ${JSON.stringify({ messages: e.reply })}`).join("\n\n");
  const corrected = p.examples.filter((e) => e.corrected);
  const examples = render(p.examples.filter((e) => !e.corrected));
  // Las correcciones las escribió el dueño arreglando respuestas del notHuman: pesan más que todo lo demás.
  const corrections = corrected.length
    ? `\n\nCorrections: ${p.owner} rewrote some of your replies. This is exactly how they answer; when a situation is similar, follow these above everything else:\n\n${render(corrected)}`
    : "";

  // Con puesto, el negocio es el del puesto (la misma persona puede trabajar en otro rubro que el de sus chats).
  const where = job
    ? `You are ${p.owner}, working at "${job.name}", answering a customer on WhatsApp.
Write exactly like ${p.owner} always writes. Customers must not notice any difference.

${jobManual(job.name, job.content)}
${stock ? `\n${stock}\n` : ""}`
    : `You are ${p.owner}, the person behind "${p.name}", answering a customer on WhatsApp.
Write exactly like them. Customers must not notice any difference.

Business:
${businessBlock(p.owner, p.business)}`;

  const facts = job
    ? `- Use the facts in "Your job" above. If you need a fact that isn't there, write a placeholder instead of inventing it: ${placeholders}.
  Never make up prices, stock, links, dates or any other data.
- The house rules of your job override your style and your examples. If the examples do something a rule forbids, follow the rule.
${
        stock
          ? `- Products, prices, stock and delivery times come from the "Stock" list above (or from the [stock rows in brackets] after the customer's message). Use them exactly as they are written and never invent a product, price or stock that isn't there. If something shows no units or "No", say it isn't available right now and offer what the list says (delivery time, booking) or a similar product that is available.\n`
          : ""
      }- If one of the hand-over cases happens, answer with the hand-over message in your own style and don't try to solve it yourself.
- ${
        stock
          ? "The customer's last message may end with [notes in brackets] (the current time, matching stock rows)"
          : "The customer's last message may end with a [note in brackets] with the current time"
      }: you wrote nothing there and the customer can't see it. Use it to know whether the business is open.
- Answer with a single JSON object: {"messages": ["<WhatsApp message>", "..."], "used": ["<short label>", "..."]}, one item per message you would send, in order. In "used", list in a few words each part of your job you relied on (e.g. "rule: shipping", "opening hours"); leave it empty if none.`
    : `- You don't know the business facts. Whenever you need one, write a placeholder instead of inventing it: ${placeholders}.
  For example, write {price} where the price goes. Never make up prices, stock, links, dates or any other data.
- Answer with a single JSON object: {"messages": ["<WhatsApp message>", "..."]}, one item per message you would send, in order.`;

  return `${where}
How you write:
- ${pr.summary}
${line("Language", pr.language)}${list("Tone", pr.tone)}${line("Register", pr.register)}- Message length: ${LENGTH_HINT[pr.messageStyle.length]}. ${
    pr.messageStyle.splitsMessages ? "You usually send several short messages in a row." : "You usually send a single message."
  }
${line("Capitalization", pr.messageStyle.capitalization)}${line("Punctuation", pr.messageStyle.punctuation)}- Emojis: ${pr.emojis.frequency}${
    pr.emojis.favorites.length ? ` (favorites: ${pr.emojis.favorites.join(" ")})` : ""
  }
${list("Greetings", pr.greetings)}${list("Sign-offs", pr.signOffs)}${list("Catchphrases", pr.catchphrases)}${line("Selling", pr.sales)}${line("Complaints", pr.complaints)}${list("Never", pr.doNots)}
Real examples of how you answer (business data replaced by placeholders):

${examples}${corrections}

Rules:
- Answer only the customer's last message, continuing the conversation naturally. Don't repeat a greeting you already sent.
- Copy the style of the examples: spelling, lowercase, slang, laughs, emojis and how you split messages. Don't sound like a customer service bot and don't write more than you would.
${facts}`;
}

/** "Contame el laburo" → el puesto ordenado en secciones. */
export function jobStructurePrompt(uiLang: UiLang): string {
  return `A business owner describes, in their own words, the job an assistant will do answering their customers on WhatsApp.
Turn it into a single JSON object:
{
  "name": "<short name of the business or job>",
  "business": { "what": "<what the business is>", "sells": "<what it sells>", "audience": "<who it sells to>", "where": "<where it is / where it sells>" },
  "rules": [ { "kind": "always" | "never" | "info", "text": "<one rule or fact>" } ],
  "schedule": {
    "days": [ { "open": true, "from": "HH:MM", "to": "HH:MM" } ],
    "offHours": "<what to tell customers outside opening hours>"
  },
  "handoff": { "triggers": ["<case where a person must take over>"], "message": "<what to say in that case>" }
}

Rules:
- "days" has exactly 7 items, Monday first. Closed days: "open": false. Use 24h times.
- One rule per item: policies (returns, payments, shipping, discounts), prohibitions ("never") and useful facts ("info"). Keep them short and concrete; keep numbers and amounts the owner gave.
- Don't invent anything the owner didn't say: leave a field as "" or an empty list. If no hours were given, use Monday to Friday 09:00-18:00.
- Write every text in ${LANG_NAME[uiLang]}, keeping the owner's own words where possible.`;
}

/** La planilla de stock de un negocio (cualquier forma) → el mapa: qué pestañas usar, dónde están los títulos
 *  y qué es cada columna. Lo revisa el dueño antes de guardarlo. */
export function stockMapPrompt(uiLang: UiLang): string {
  return `A business shared its spreadsheet so an assistant can answer customers on WhatsApp with real products, prices and stock.
Every spreadsheet is different: titles may not be on the first row, there may be blank rows, notes, several tables or tabs that have nothing to do with customers.
You get the first rows of each tab; each row is a JSON object from column number (0 = column A) to cell text.

Answer with a single JSON object:
{
  "tabs": [
    {
      "name": "<tab name, exactly as given>",
      "use": "catalog" | "info" | "ignore",
      "headerRow": <number of the row with the column titles>,
      "columns": [ { "index": <column number>, "role": "name" | "id" | "price" | "stock" | "detail" | "private" } ]
    }
  ]
}

Rules:
- "catalog": products or services the business sells, one per row. "info": facts useful for customers (payments, promos, shipping, hours, address). "ignore": anything internal or useless for customers (salaries, suppliers, accounting, instructions, staff notes, empty tabs).
- List every column that has a title in "headerRow". Roles: "name" what the product is (model, product, description); "id" a code or SKU; "price" any price or installment amount; "stock" quantities or availability; "detail" anything else a customer may see (brand, color, size, year, delivery time, notes for customers); "private" anything a customer must never see: costs, what the business paid, suppliers, margins, internal notes, staff or personal data.
- When in doubt about a column, use "private". When in doubt about a tab, use "ignore".
- Include every tab, with the exact name. Tab and column texts may be in any language; the owner's language is ${LANG_NAME[uiLang]}.`;
}
