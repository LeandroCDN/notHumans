import { NextResponse } from "next/server";
import { z } from "zod";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    const nh = await notHumans().get(id, user.id);
    return nh ? NextResponse.json(nh) : notFound();
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    await notHumans().remove(id, user.id);
    return NextResponse.json({ ok: true });
  });
}
