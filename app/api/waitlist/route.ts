import { NextResponse } from "next/server";
import { z } from "zod";
import { joinWaitlist } from "@/lib/db/waitlist";

// Público (la home no pide login). Topes para que no lo usen de spam: formato de mail, un campo trampa
// invisible que solo completan los bots, y pocos intentos por minuto por IP.

const Body = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  locale: z.enum(["en", "es"]).catch("en"),
  /** Campo trampa: una persona no lo ve, así que tiene que venir vacío. */
  website: z.string().max(0).optional(),
});

const PER_MINUTE = 5;
const hits = new Map<string, number[]>();
function tooFast(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > PER_MINUTE;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (tooFast(ip)) return NextResponse.json({ error: "too_fast" }, { status: 429 });
  const raw = await req.json().catch(() => null);
  // A un bot que completó la trampa le decimos que sí, pero no lo anotamos.
  if (raw && typeof raw.website === "string" && raw.website.length > 0) return NextResponse.json({ ok: true });
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  try {
    await joinWaitlist(parsed.data.email, parsed.data.locale);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
