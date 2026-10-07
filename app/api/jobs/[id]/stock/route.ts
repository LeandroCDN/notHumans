import { z } from "zod";
import { stock } from "@/lib/db/stock";
import { RequestError } from "@/lib/nothuman/api";
import { connect, robotEmail } from "@/lib/stock/service";
import { withJob } from "@/lib/stock/route";
import { StockMapSchema } from "@/lib/stock/types";

type Ctx = { params: Promise<{ id: string }> };

/** La planilla conectada al puesto (si hay) y el mail del robot para compartírsela. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withJob(id, async () => ({ robot: robotEmail(), source: await stock().get(id) }));
}

const Body = z.object({ spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{20,100}$/), map: StockMapSchema });

/** Guarda el mapa que revisó el dueño y hace la primera copia (la planilla se vuelve a leer acá). */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withJob(id, async (user) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new RequestError("bad_request", 400);
    return connect(user, id, parsed.data.spreadsheetId, parsed.data.map);
  });
}

/** Desconecta la planilla (el notHuman deja de ver el stock; la planilla del cliente no se toca). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withJob(id, async (user) => {
    await stock().remove(id, user.id);
    return { ok: true };
  });
}
