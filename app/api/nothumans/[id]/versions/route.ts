import { NextResponse } from "next/server";
import { z } from "zod";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { ExampleSchema, type NotHuman } from "@/lib/nothuman/schema";
import { correctionsLeak, encodeNote, withCorrections } from "@/lib/nothuman/versions";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("kind", [
  // Respuestas corregidas desde el chat de prueba → ejemplos fijos de la versión nueva.
  z.object({ kind: z.literal("corrections"), base: z.number().int().min(1), corrections: z.array(ExampleSchema).min(1).max(50) }),
  // Volver a una versión anterior: se copia como versión nueva, así el historial nunca se pierde.
  z.object({ kind: z.literal("restore"), base: z.number().int().min(1), version: z.number().int().min(1) }),
]);

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
const conflict = () => NextResponse.json({ error: "conflict" }, { status: 409 });

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    return NextResponse.json({ items: await notHumans().versions(id, user.id) });
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_request", detail: parsed.error.message }, { status: 400 });
    const body = parsed.data;

    const repo = notHumans();
    const current = await repo.get(id, user.id);
    if (!current) return notFound();
    // Alguien guardó otra versión mientras tanto: que el navegador recargue en vez de pisarla.
    if (current.version !== body.base) return conflict();

    let next: NotHuman;
    let note: string;
    if (body.kind === "corrections") {
      const leak = correctionsLeak(body.corrections);
      if (leak) return NextResponse.json({ error: "leak", leak }, { status: 400 });
      next = { ...current, version: body.base + 1, examples: withCorrections(current, body.corrections) };
      note = encodeNote({ kind: "corrections", count: body.corrections.length });
    } else {
      const old = await repo.getVersion(id, user.id, body.version);
      if (!old) return notFound();
      next = { ...old, name: current.name, version: body.base + 1 };
      note = encodeNote({ kind: "restored", from: body.version });
    }

    if (!(await repo.saveVersion(next, body.base, note, user))) return conflict();
    return NextResponse.json(next, { status: 201 });
  });
}
