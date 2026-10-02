import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { StorageNotConfiguredError } from "./nothumans";

/** Para las rutas de datos: exige sesión y traduce los errores de la base a respuestas JSON claras. */
export async function withUser(handler: (user: string) => Promise<Response>): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return await handler(user);
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: "storage_not_configured" }, { status: 500 });
    }
    console.error(err);
    return NextResponse.json({ error: "storage_error", detail: String((err as Error).message) }, { status: 502 });
  }
}
