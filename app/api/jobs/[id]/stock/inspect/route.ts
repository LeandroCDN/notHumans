import { z } from "zod";
import { RequestError } from "@/lib/nothuman/api";
import { inspect } from "@/lib/stock/service";
import { withJob } from "@/lib/stock/route";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ url: z.string().trim().min(1).max(500), uiLang: z.enum(["en", "es"]).default("es") });

/** Lee la planilla y propone cómo entenderla (para que el dueño lo revise antes de guardar). */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return withJob(id, async (user) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new RequestError("bad_url", 400);
    return inspect(user, id, parsed.data.url, parsed.data.uiLang);
  });
}
