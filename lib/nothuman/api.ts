import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LimitError, limitResponse } from "@/lib/account";
import { type SessionUser, getSessionUser } from "@/lib/auth";
import { MissingKeyError } from "@/lib/llm";
import { BusinessSchema } from "./schema";

export { BusinessSchema };

export const BaseRequest = z.object({
  /** El ticket de /api/generate/start: sin él no se gasta IA en generar. */
  ticket: z.string().max(300),
  owner: z.string().min(1).max(120),
  business: BusinessSchema,
  uiLang: z.enum(["en", "es"]).default("en"),
});

/** Un error con código propio para el navegador (por ejemplo, un ticket de generación vencido). */
export class RequestError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

/** Corre el handler solo con sesión iniciada y traduce los errores (IA, topes del plan) a respuestas JSON claras. */
export async function guarded<T extends z.ZodType>(
  req: Request,
  schema: T,
  handler: (body: z.infer<T>, user: SessionUser) => Promise<unknown>,
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", detail: parsed.error.message }, { status: 400 });
  try {
    return NextResponse.json(await handler(parsed.data, user));
  } catch (err) {
    if (err instanceof LimitError) return limitResponse(err);
    if (err instanceof RequestError) return NextResponse.json({ error: err.code }, { status: err.status });
    if (err instanceof MissingKeyError) return NextResponse.json({ error: "missing_key" }, { status: 500 });
    console.error(err);
    return NextResponse.json({ error: "llm_error", detail: String((err as Error).message) }, { status: 502 });
  }
}
