import { NextResponse } from "next/server";
import { z } from "zod";
import { MissingKeyError } from "@/lib/llm";
import { findModel } from "@/lib/llm/models";
import { notHumans } from "@/lib/db/nothumans";
import { shares } from "@/lib/db/shares";
import { chatPersona } from "@/lib/nothuman/persona";
import { replyAs } from "@/lib/nothuman/reply";

export const maxDuration = 60;

// Chat público: sin sesión, solo con el token del link. Todo lo arma el server (la persona sale de la base,
// no del navegador) y hay topes para que nadie gaste tokens de más: largo de la charla, mensajes por minuto
// y respuestas totales por link.

const Text = z.string().trim().min(1).max(1000);
const Body = z.object({
  turns: z
    .array(z.object({ from: z.enum(["client", "nh"]), texts: z.array(Text).min(1).max(10) }))
    .min(1)
    .max(40)
    .refine((t) => t[t.length - 1].from === "client")
    .refine((t) => t.reduce((n, x) => n + x.texts.join("").length, 0) <= 15_000),
});

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

// Límite por IP, en memoria de cada instancia: no es perfecto en serverless, pero frena a un script.
const PER_MINUTE = 12;
const hits = new Map<string, number[]>();
function tooFast(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > PER_MINUTE;
}

const error = (code: string, status: number) => NextResponse.json({ error: code }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return error("not_found", 404);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (tooFast(`${ip}|${token}`)) return error("too_fast", 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("bad_request", 400);

  try {
    const share = await shares().find(token);
    const nh = share && (await notHumans().get(share.nothumanId));
    if (!nh) return error("not_found", 404);
    if (!(await shares().use(token))) return error("limit", 429);
    const reply = await replyAs(chatPersona(nh), parsed.data.turns, findModel(undefined));
    // Al público solo le llegan los mensajes: nada de costos, modelo ni razonamiento.
    return NextResponse.json({ messages: reply.messages });
  } catch (err) {
    if (err instanceof MissingKeyError) return error("unavailable", 503);
    console.error(err);
    return error("unavailable", 502);
  }
}
