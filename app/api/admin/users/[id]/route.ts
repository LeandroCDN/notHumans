import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/db/route";
import { profiles } from "@/lib/db/profiles";
import { PLAN_IDS } from "@/lib/plans";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ plan: z.enum(PLAN_IDS), until: z.number().int().positive().nullable().default(null) });

/** Cambiar el plan de una cuenta (a mano: todavía no hay cobros). Solo admins. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withAdmin(async (admin) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    // Que un admin no se saque el admin a sí mismo por error y quede afuera del panel.
    if (id === admin.id && parsed.data.plan !== "admin") return NextResponse.json({ error: "self" }, { status: 400 });
    const ok = await profiles().setPlan(id, parsed.data.plan, parsed.data.until);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  });
}
