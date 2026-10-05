import { NextResponse } from "next/server";
import { charge, requireRoom } from "@/lib/account";
import { notHumans } from "@/lib/db/nothumans";
import { withUser } from "@/lib/db/route";
import { makeTicket } from "@/lib/nothuman/ticket";

/** Arranca una generación: descuenta una del plan (si hay lugar para otro notHuman) y devuelve el ticket. */
export async function POST() {
  return withUser(async (user) => {
    requireRoom(user, "nothumans", await notHumans().count(user.id));
    const c = await charge(user, "generation");
    return NextResponse.json({ ticket: makeTicket(user.id, c.id) });
  });
}
