import { NextResponse } from "next/server";
import { describe } from "@/lib/account";
import { googleEnabled } from "@/lib/auth";
import { withUser } from "@/lib/db/route";

/** La cuenta de la sesión: plan, topes y consumo del mes (para los medidores y para bloquear lo que no entra). */
export async function GET() {
  return withUser(async (user) => NextResponse.json(await describe(user, { canLinkGoogle: googleEnabled() })));
}
