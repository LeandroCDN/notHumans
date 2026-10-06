import { NextResponse } from "next/server";
import { z } from "zod";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { wa } from "@/lib/db/wa";
import { CHANNEL_MODES } from "@/lib/wa/types";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  displayPhone: z.string().trim().max(40).optional(),
  nothumanId: z.uuid().nullable().optional(),
  mode: z.enum(CHANNEL_MODES).optional(),
});
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/** Cambiar qué notHuman atiende el número, el modo o el número que se muestra. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const { nothumanId } = parsed.data;
    if (nothumanId && !(await notHumans().get(nothumanId, user.id))) return notFound();
    const channel = await wa().updateChannel(id, user.id, parsed.data);
    return channel ? NextResponse.json(channel) : notFound();
  });
}

/** Desconecta el número (se borran sus charlas). En Meta el número sigue existiendo. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (user) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    await wa().removeChannel(id, user.id);
    return NextResponse.json({ ok: true });
  });
}
