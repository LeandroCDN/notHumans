import { NextResponse } from "next/server";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { NotHumanSchema } from "@/lib/nothuman/schema";

/** Todos los notHumans (las cuentas son del mismo equipo, así que se ven entre sí). */
export async function GET() {
  return withUser(async () => NextResponse.json({ items: await notHumans().list() }));
}

/** Guarda un notHuman recién generado o importado. Si el id ya existe no lo pisa. */
export async function POST(req: Request) {
  return withUser(async (user) => {
    const parsed = NotHumanSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", detail: parsed.error.message }, { status: 400 });
    }
    const created = await notHumans().create(parsed.data, user);
    return NextResponse.json({ id: parsed.data.id, created }, { status: created ? 201 : 200 });
  });
}
