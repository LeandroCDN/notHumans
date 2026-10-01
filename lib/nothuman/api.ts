import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { MissingKeyError } from "@/lib/llm";

export const BusinessSchema = z.object({
  name: z.string().max(200).default(""),
  whatTheySell: z.string().max(500).default(""),
  where: z.string().max(300).default(""),
  audience: z.string().max(100).default(""),
  roles: z.array(z.string().max(100)).max(10).default([]),
  notes: z.string().max(2000).default(""),
});

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
