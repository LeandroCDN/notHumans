import type { Day, JobContent, RuleKind } from "./schema";

// El "manual del empleado": el texto que lee el notHuman sobre su puesto. Función pura: el editor muestra
// exactamente esto, así no hay nada escondido. Es fijo por versión del puesto, así que va al prompt sin
// romper la caché; lo único que cambia minuto a minuto (la hora) va aparte, en `nowNote`.

const L = {
  es: {
    title: (name: string) => `Tu puesto: ${name}`,
    what: "Qué es",
    sells: "Qué vende",
    audience: "A quién le vende",
    where: "Dónde",
    rules: "Reglas de la casa (mandan por sobre tu estilo y tus ejemplos)",
    kinds: { always: "SIEMPRE", never: "NUNCA", info: "DATO" } as Record<RuleKind, string>,
    schedule: "Horario de atención",
    days: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"],
    closed: "cerrado",
    offHours: "Fuera de horario",
    handoff: "Pasá la charla a una persona si",
    handoffSay: "En ese caso decí algo como",
    now: (when: string, open: boolean) =>
      `[Dato para vos, no lo escribió el cliente: ahora es ${when}; el negocio está ${open ? "abierto" : "cerrado"}.]`,
  },
  en: {
    title: (name: string) => `Your job: ${name}`,
    what: "What it is",
    sells: "What it sells",
    audience: "Who it sells to",
    where: "Where",
    rules: "House rules (they override your style and your examples)",
    kinds: { always: "ALWAYS", never: "NEVER", info: "FACT" } as Record<RuleKind, string>,
    schedule: "Opening hours",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    closed: "closed",
    offHours: "Outside opening hours",
    handoff: "Hand the chat over to a person if",
    handoffSay: "When that happens, say something like",
    now: (when: string, open: boolean) =>
      `[Note for you, not written by the customer: it's ${when} right now; the business is ${open ? "open" : "closed"}.]`,
  },
};

/** "Lunes a viernes 9:00–18:00 · Sábado 9:00–13:00 · Domingo cerrado": junta los días seguidos con el mismo horario. */
export function scheduleSummary(days: Day[], lang: "es" | "en"): string {
  const t = L[lang];
  const label = (d: Day) => (d.open ? `${d.from}–${d.to}` : t.closed);
  const groups: { from: number; to: number; label: string }[] = [];
  days.forEach((d, i) => {
    const last = groups.at(-1);
    if (last && last.label === label(d) && last.to === i - 1) last.to = i;
    else groups.push({ from: i, to: i, label: label(d) });
  });
  const joiner = lang === "es" ? " a " : " to ";
  return groups
    .map((g) => `${g.from === g.to ? t.days[g.from] : t.days[g.from] + joiner + t.days[g.to].toLowerCase()} ${g.label}`)
    .join(" · ");
}

export function jobManual(name: string, c: JobContent): string {
  const t = L[c.lang];
  const lines: string[] = [`## ${t.title(name)}`];
  const b = c.business;
  for (const [label, v] of [
    [t.what, b.what],
    [t.sells, b.sells],
    [t.audience, b.audience],
    [t.where, b.where],
  ] as const) {
    if (v.trim()) lines.push(`- ${label}: ${v.trim()}`);
  }
  if (c.rules.length) {
    lines.push("", `${t.rules}:`);
    for (const r of c.rules) lines.push(`- ${t.kinds[r.kind]}: ${r.text}`);
  }
  lines.push("", `${t.schedule} (${c.schedule.tz}): ${scheduleSummary(c.schedule.days, c.lang)}.`);
  if (c.schedule.offHours.trim()) lines.push(`${t.offHours}: ${c.schedule.offHours.trim()}`);
  if (c.handoff.triggers.length) {
    lines.push("", `${t.handoff}: ${c.handoff.triggers.join("; ")}.`);
    if (c.handoff.message.trim()) lines.push(`${t.handoffSay}: "${c.handoff.message.trim()}"`);
  }
  return lines.join("\n");
}

/** Día (0 = lunes) y hora "HH:MM" en la zona horaria del negocio. */
export function localTime(tz: string, at: Date): { day: number; hhmm: string; label: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const hhmm = `${get("hour")}:${get("minute")}`;
  return { day: Math.max(0, day), hhmm, label: hhmm };
}

export function isOpen(c: JobContent, at: Date): boolean {
  const { day, hhmm } = localTime(c.schedule.tz, at);
  const d = c.schedule.days[day];
  return !!d?.open && hhmm >= d.from && hhmm < d.to;
}

/** La línea con la hora actual que se pega al último mensaje del cliente (no al prompt fijo, para no romper la caché). */
export function nowNote(c: JobContent, at: Date): string {
  const t = L[c.lang];
  const { day, hhmm } = localTime(c.schedule.tz, at);
  return t.now(`${t.days[day].toLowerCase()} ${hhmm}`, isOpen(c, at));
}
