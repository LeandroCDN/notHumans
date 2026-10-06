import { NextResponse } from "next/server";
import { z } from "zod";
import { discardDraft, sendDraft } from "@/lib/wa/bot";
import { waRoute } from "@/lib/wa/route";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

const Action = z.discriminatedUnion("action", [
  // Mandar el borrador tal cual o corregido (una burbuja por renglón).
  z.object({ action: z.literal("send"), texts: z.array(z.string().max(4000)).min(1).max(10).optional() }),
  z.object({ action: z.literal("discard") }),
]);

/** Aprobar (y mandar) o descartar un borrador del notHuman. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return waRoute(async (user) => {
    const parsed = Action.safeParse(await req.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (parsed.data.action === "discard") {
      await discardDraft(id, user.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await sendDraft(id, user.id, parsed.data.texts));
  });
}
