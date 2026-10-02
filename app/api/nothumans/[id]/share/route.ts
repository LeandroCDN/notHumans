import { NextResponse } from "next/server";
import { z } from "zod";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { shares } from "@/lib/db/shares";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/** El link público activo del notHuman (o null). */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async () => {
    if (!z.uuid().safeParse(id).success) return notFound();
    return NextResponse.json({ share: await shares().active(id) });
  });
}

/** Crea el link público (si ya había uno activo, devuelve ese). */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    if (!z.uuid().safeParse(id).success || !(await notHumans().get(id))) return notFound();
    return NextResponse.json({ share: await shares().create(id, user) });
  });
}

/** Desactiva el link: deja de funcionar para todos los que lo tengan. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async () => {
    if (!z.uuid().safeParse(id).success) return notFound();
    await shares().revoke(id);
    return NextResponse.json({ share: null });
  });
}
