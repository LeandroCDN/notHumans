import { NextResponse, after } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/db/route";
import { wa } from "@/lib/db/wa";
import { processWebhook } from "@/lib/wa/bot";
import { mockWhatsApp } from "@/lib/wa/cloud";
import { fakeInbound } from "@/lib/wa/webhook";

export const maxDuration = 120;

const Body = z.object({
  channelId: z.uuid(),
  from: z.string().trim().regex(/^\d{6,20}$/),
  name: z.string().trim().max(60).default(""),
  text: z.string().trim().min(1).max(2000),
});

/** Solo sin Meta (desarrollo / LLM_MOCK=1): hace de cliente y manda un mensaje al número, como si llegara de WhatsApp. */
export async function POST(req: Request) {
  return withUser(async (user) => {
    if (!mockWhatsApp()) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const { channelId, from, name, text } = parsed.data;
    const channel = await wa().channel(channelId, user.id);
    if (!channel) return NextResponse.json({ error: "not_found" }, { status: 404 });
    after(() => processWebhook(fakeInbound(channel.phoneNumberId, from, name, text)));
    return NextResponse.json({ ok: true });
  });
}
