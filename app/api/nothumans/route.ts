import { NextResponse } from "next/server";
import { requireRoom } from "@/lib/account";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { NotHumanSchema } from "@/lib/nothuman/schema";

/** Los notHumans de la cuenta. */
export async function GET() {
  return withUser(async (user) => NextResponse.json({ items: await notHumans().list(user.id) }));
}

/** Guarda un notHuman recién generado o importado. Si el id ya existe no lo pisa. */
export async function POST(req: Request) {
  return withUser(async (user) => {
    const parsed = NotHumanSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "bad_request", detail: parsed.error.message }, { status: 400 });
    }
    const repo = notHumans();
    // Lo que ya está guardado (un import repetido) no ocupa lugar de nuevo.
    if (!(await repo.get(parsed.data.id, user.id))) requireRoom(user, "nothumans", await repo.count(user.id));
    const created = await repo.create(parsed.data, user);
    return NextResponse.json({ id: parsed.data.id, created }, { status: created ? 201 : 200 });
  });
}
