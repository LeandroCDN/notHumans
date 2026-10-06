import { NextResponse } from "next/server";
import { z } from "zod";
import { wa } from "@/lib/db/wa";
import { sendManual, setConversationStatus, suggest } from "@/lib/wa/bot";
import { waRoute } from "@/lib/wa/route";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
const Status = z.object({ status: z.enum(["bot", "human"]) });
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), text: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("suggest") }),
]);

/** La charla con sus mensajes. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return waRoute(async (user) => {
    if (!z.uuid().safeParse(id).success) return notFound();
    const conversation = await wa().conversation(id, user.id);
    if (!conversation) return notFound();
    return NextResponse.json({ conversation, messages: await wa().messages(id) });
  });
}

/** "Tomar la charla" (el bot se calla) o devolvérsela al notHuman. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  return waRoute(async (user) => {
    const parsed = Status.safeParse(await req.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    await setConversationStatus(id, user.id, parsed.data.status);
    return NextResponse.json({ ok: true });
  });
}

/** Escribir a mano (como el dueño) o pedirle al notHuman una sugerencia. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return waRoute(async (user) => {
    const parsed = Action.safeParse(await req.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (parsed.data.action === "send") return NextResponse.json(await sendManual(id, user.id, parsed.data.text));
    await suggest(id, user.id);
    return NextResponse.json({ ok: true });
  });
}
