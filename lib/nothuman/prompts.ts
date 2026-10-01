import { INTENTS, PLACEHOLDERS, type BusinessInput } from "./schema";

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
- Do NOT replace style: greetings, nicknames ("hermosa", "maestro", "genio"), slang, emojis, laughs.
- Ignore lines that say "(media)".

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
