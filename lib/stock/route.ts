import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LimitError, limitResponse } from "@/lib/account";
import { type SessionUser, getSessionUser } from "@/lib/auth";
import { jobs } from "@/lib/db/jobs";
import { SheetError } from "@/lib/google/sheets";
import { MissingKeyError } from "@/lib/llm";
import { RequestError } from "@/lib/nothuman/api";

/** Las rutas del stock: sesión y errores con un código para el navegador. */
export async function withStockUser(handler: (user: SessionUser) => Promise<unknown>): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await handler(user));
  } catch (err) {
    if (err instanceof LimitError) return limitResponse(err);
    if (err instanceof SheetError) return NextResponse.json({ error: err.code }, { status: 422 });
    if (err instanceof RequestError) return NextResponse.json({ error: err.code }, { status: err.status });
    if (err instanceof MissingKeyError) return NextResponse.json({ error: "missing_key" }, { status: 500 });
    console.error(err);
    return NextResponse.json({ error: "generic", detail: String((err as Error).message) }, { status: 502 });
  }
}

/** Igual, para el stock de un puesto que tiene que ser de la cuenta. */
export async function withJob(id: string, handler: (user: SessionUser) => Promise<unknown>): Promise<Response> {
  return withStockUser(async (user) => {
    if (!z.uuid().safeParse(id).success || !(await jobs().get(id, user.id))) throw new RequestError("not_found", 404);
    return handler(user);
  });
}
