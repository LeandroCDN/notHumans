import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/db/route";
import { usage } from "@/lib/db/usage";
import { readTicket } from "@/lib/nothuman/ticket";

const Body = z.object({ ticket: z.string().max(300) });

/** La generación falló antes de llegar al perfil: se devuelve (lo que ya se gastó en bloques igual cuenta como costo). */
export async function POST(req: Request) {
  return withUser(async (user) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const id = await readTicket(parsed.data.ticket, user.id);
    if (id !== null && !(await usage().hasRef(String(id), "profile"))) await usage().refund(id);
    return NextResponse.json({ ok: true });
  });
}
