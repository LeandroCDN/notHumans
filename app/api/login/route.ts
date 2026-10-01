import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, checkCredentials, createSessionValue } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { user?: unknown; password?: unknown } | null;
  const user = typeof body?.user === "string" ? body.user : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const name = checkCredentials(user, password);
  if (!name) {
    // Frena un poco a quien prueba contraseñas en loop.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, user: name });
  res.cookies.set(SESSION_COOKIE, createSessionValue(name), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
