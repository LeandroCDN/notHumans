import { NextResponse } from "next/server";
import { listAccounts } from "@/lib/account";
import { withAdmin } from "@/lib/db/route";
import { listWaitlist } from "@/lib/db/waitlist";

/** Todas las cuentas con su plan y consumo del mes, y la lista de espera. Solo admins. */
export async function GET() {
  return withAdmin(async () => {
    const [users, waitlist] = await Promise.all([listAccounts(), listWaitlist()]);
    return NextResponse.json({ users, waitlist });
  });
}
