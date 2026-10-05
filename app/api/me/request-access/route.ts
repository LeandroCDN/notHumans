import { NextResponse } from "next/server";
import { withUser } from "@/lib/db/route";
import { profiles } from "@/lib/db/profiles";

/** "Pedir acceso": queda anotado en el perfil y el admin lo ve arriba de todo en su panel. */
export async function POST() {
  return withUser(async (user) => {
    await profiles().requestAccess(user.id);
    return NextResponse.json({ ok: true, accessRequestedAt: user.accessRequestedAt ?? Date.now() });
  });
}
