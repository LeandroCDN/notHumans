import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { MissingKeyError } from "@/lib/llm";
import { BusinessSchema } from "./schema";

export { BusinessSchema };

export const BaseRequest = z.object({
  owner: z.string().min(1).max(120),
  business: BusinessSchema,
  uiLang: z.enum(["en", "es"]).default("en"),
});

/** Corre el handler solo con sesión iniciada y traduce los errores a respuestas JSON claras. */
export async function guarded<T extends z.ZodType>(
  req: Request,
  schema: T,
  handler: (body: z.infer<T>) => Promise<unknown>,
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", detail: parsed.error.message }, { status: 400 });
  try {
    return NextResponse.json(await handler(parsed.data));
  } catch (err) {
    if (err instanceof MissingKeyError) return NextResponse.json({ error: "missing_key" }, { status: 500 });
    console.error(err);
    return NextResponse.json({ error: "llm_error", detail: String((err as Error).message) }, { status: 502 });
  }
}
