import "server-only";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";
import { withUser } from "@/lib/db/route";
import { WaActionError } from "./bot";

const STATUS: Record<WaActionError["code"], number> = { not_found: 404, window_closed: 409, send_failed: 502, empty: 400 };

/** Rutas de la bandeja: sesión + errores de WhatsApp traducidos (ventana de 24 h cerrada, envío fallido…). */
export function waRoute(handler: (user: SessionUser) => Promise<Response>): Promise<Response> {
  return withUser(async (user) => {
    try {
      return await handler(user);
    } catch (err) {
      if (err instanceof WaActionError) return NextResponse.json({ error: err.code }, { status: STATUS[err.code] });
      throw err;
    }
  });
}
