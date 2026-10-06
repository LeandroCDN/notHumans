import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/db/route";
import { wa } from "@/lib/db/wa";

/** Las charlas de la cuenta (de un número, si se pide), las más recientes primero. */
export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get("channel") ?? undefined;
  return withUser(async (user) => {
    if (channel && !z.uuid().safeParse(channel).success) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: await wa().conversations(user.id, channel) });
  });
}
