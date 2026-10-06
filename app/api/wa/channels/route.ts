import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFeature } from "@/lib/account";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { wa } from "@/lib/db/wa";
import { missingWhatsAppConfig, mockWhatsApp } from "@/lib/wa/cloud";
import { CHANNEL_MODES } from "@/lib/wa/types";

const Body = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/),
  displayPhone: z.string().trim().max(40).default(""),
  nothumanId: z.uuid().nullable().default(null),
  mode: z.enum(CHANNEL_MODES).default("draft"),
});

/** Los números de WhatsApp conectados a la cuenta, y si el server está listo para hablar con Meta. */
export async function GET() {
  return withUser(async (user) =>
    NextResponse.json({ items: await wa().channels(user.id), mock: mockWhatsApp(), missing: missingWhatsAppConfig() }),
  );
}

/** Conecta un número (etapa de prueba: el Phone Number ID que muestra Meta). */
export async function POST(req: Request) {
  return withUser(async (user) => {
    requireFeature(user, "connections");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const c = parsed.data;
    if (c.nothumanId && !(await notHumans().get(c.nothumanId, user.id))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const channel = await wa().createChannel(user.id, c);
    if (channel === "taken") return NextResponse.json({ error: "taken" }, { status: 409 });
    return NextResponse.json(channel, { status: 201 });
  });
}
