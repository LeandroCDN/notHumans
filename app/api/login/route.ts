import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkCredentials,
  cookieOptions,
  createSessionValue,
  isAdminIdentity,
  missingAuthConfig,
  passwordEnabled,
} from "@/lib/auth";
import { profiles } from "@/lib/db/profiles";

/** Entrar con una cuenta fija de AUTH_USERS (las de antes de que hubiera cuentas con Google). */
export async function POST(req: Request) {
  const missing = missingAuthConfig();
  if (missing.length > 0 || !passwordEnabled()) {
    return NextResponse.json({ ok: false, missing: missing.length ? missing : ["AUTH_USERS"] }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { user?: unknown; password?: unknown } | null;
  const user = typeof body?.user === "string" ? body.user : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const name = checkCredentials(user, password);
  if (!name) {
    // Frena un poco a quien prueba contraseñas en loop.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const profile = await profiles().fromLegacy(name, isAdminIdentity({ login: name }));
    const res = NextResponse.json({ ok: true, user: profile.name });
    res.cookies.set(SESSION_COOKIE, createSessionValue(profile.id), cookieOptions(SESSION_MAX_AGE));
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "storage_error" }, { status: 502 });
  }
}
