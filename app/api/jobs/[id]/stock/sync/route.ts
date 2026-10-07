import { stock } from "@/lib/db/stock";
import { RequestError } from "@/lib/nothuman/api";
import { sync } from "@/lib/stock/service";
import { withJob } from "@/lib/stock/route";

type Ctx = { params: Promise<{ id: string }> };

/** "Actualizar ahora": vuelve a leer la planilla. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withJob(id, async (user) => {
    const source = await stock().get(id);
    if (!source) throw new RequestError("not_connected", 404);
    return sync(source, user.id);
  });
}
