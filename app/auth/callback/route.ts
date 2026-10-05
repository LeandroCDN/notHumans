import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  cookieOptions,
  createSessionValue,
  isAdminIdentity,
  mockAuth,
  supabaseAuthConfig,
  verifySigned,
} from "@/lib/auth";
import { type GoogleIdentity, profiles } from "@/lib/db/profiles";
import { LINK_COOKIE, PKCE_COOKIE, exchangeCode, mockIdentity } from "@/lib/oauth";

// Vuelta de Google: quién es → su perfil (lo crea si es nuevo, en Free) → nuestra cookie de sesión.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin));
    res.cookies.delete(PKCE_COOKIE);
    res.cookies.delete(LINK_COOKIE);
    return res;
  };

  let identity: GoogleIdentity | null = null;
  try {
    const mock = url.searchParams.get("mock");
    if (mock && mockAuth()) {
      identity = /^[^@\s]+@[^@\s]+$/.test(mock) ? mockIdentity(mock, url.searchParams.get("name") ?? undefined) : null;
    } else {
      const code = url.searchParams.get("code");
      const verifier = jar.get(PKCE_COOKIE)?.value;
      const cfg = supabaseAuthConfig();
      if (code && verifier && cfg) identity = await exchangeCode(cfg, code, verifier);
    }
    if (!identity) return go("/?login=error");

    // Vincular: la cookie dice a qué cuenta (firmada al empezar, con la sesión de ese momento).
    const link = jar.get(LINK_COOKIE)?.value;
    if (link) {
      const [profileId, sig] = link.split(".");
      if (!profileId || !sig || !verifySigned(`link:${profileId}`, sig)) return go("/app?linked=error");
      const result = await profiles().linkGoogle(profileId, identity);
      return go(`/app?linked=${result}`);
    }

    const profile = await profiles().fromGoogle(identity, isAdminIdentity({ email: identity.email }));
    const res = go("/app");
    res.cookies.set(SESSION_COOKIE, createSessionValue(profile.id), cookieOptions(SESSION_MAX_AGE));
    return res;
  } catch (err) {
    console.error(err);
    return go("/?login=error");
  }
}
