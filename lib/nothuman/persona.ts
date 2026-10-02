import type { ChatPersona } from "./prompts";
import type { NotHuman } from "./schema";

/**
 * Lo que va al prompt del chat: perfil y ejemplos fijos (no todos, para no inflar el prompt).
 * Las correcciones van siempre; los canónicos completan hasta 40.
 */
export function chatPersona(nh: NotHuman): ChatPersona {
  const corrected = nh.examples.filter((e) => e.corrected).slice(0, 30);
  const fixed = nh.examples.filter((e) => e.canonical && !e.corrected);
  const rest = (fixed.length || corrected.length ? fixed : nh.examples).slice(0, Math.max(0, 40 - corrected.length));
  const examples = [...corrected, ...rest].map(({ intent, context, reply, corrected }) => ({
    intent,
    context,
    reply,
    corrected,
  }));
  return { name: nh.name, owner: nh.owner, business: nh.business, profile: nh.profile, examples };
}
