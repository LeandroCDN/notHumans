import "server-only";
import { NextResponse } from "next/server";
import { LimitError, limitResponse } from "@/lib/account";
import { type SessionUser, getSessionUser } from "@/lib/auth";
import { StorageNotConfiguredError } from "./nothumans";

/** Para las rutas de datos: exige sesión y traduce los errores (base, topes del plan) a respuestas JSON claras. */
export async function withUser(handler: (user: SessionUser) => Promise<Response>): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return await handler(user);
  } catch (err) {
    if (err instanceof LimitError) return limitResponse(err);
    if (err instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: "storage_not_configured" }, { status: 500 });
    }
    console.error(err);
    return NextResponse.json({ error: "storage_error", detail: String((err as Error).message) }, { status: 502 });
  }
}

/** Igual, pero solo para admins (el resto ve un 404: ni se entera de que existe). */
export async function withAdmin(handler: (user: SessionUser) => Promise<Response>): Promise<Response> {
  return withUser(async (user) => (user.admin ? handler(user) : NextResponse.json({ error: "not_found" }, { status: 404 })));
}
