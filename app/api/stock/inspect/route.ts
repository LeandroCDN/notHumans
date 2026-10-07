import { z } from "zod";
import { RequestError } from "@/lib/nothuman/api";
import { inspect } from "@/lib/stock/service";
import { withStockUser } from "@/lib/stock/route";

export const maxDuration = 60;

const Body = z.object({ url: z.string().trim().min(1).max(500), uiLang: z.enum(["en", "es"]).default("es") });

/** Leer y entender una planilla para un puesto que se está creando: se conecta cuando el puesto se guarda. */
export async function POST(req: Request) {
  return withStockUser(async (user) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new RequestError("bad_url", 400);
    return inspect(user, null, parsed.data.url, parsed.data.uiLang);
  });
}
