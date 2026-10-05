import { NextResponse } from "next/server";
import { cookieOptions, getSessionUser, googleEnabled, mockAuth, sign, supabaseAuthConfig } from "@/lib/auth";
import { LINK_COOKIE, PKCE_COOKIE, authorizeUrl, pkcePair } from "@/lib/oauth";

// "Entrar con Google": manda a Supabase Auth (que manda a Google) y vuelve a /auth/callback.
// ?link=1 → vincular Google a la cuenta con la que ya estás adentro (cuentas fijas de AUTH_USERS).
// Sin Supabase (desarrollo / LLM_MOCK=1) no hay Google: vuelve directo con una cuenta de prueba
// (?as=mail&name=… para elegir cuál).

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/?login=${q}`, url.origin));
  if (!googleEnabled()) return back("unavailable");

  let link: string | null = null;
  if (url.searchParams.get("link") === "1") {
    const user = await getSessionUser();
    if (!user) return back("error");
    link = `${user.id}.${sign(`link:${user.id}`)}`;
  }

  let res: NextResponse;
  if (mockAuth()) {
    const as = (url.searchParams.get("as") ?? "demo@nothumans.dev").trim().toLowerCase().slice(0, 120);
    const q = new URLSearchParams({ mock: as, name: (url.searchParams.get("name") ?? "").slice(0, 60) });
    res = NextResponse.redirect(new URL(`/auth/callback?${q}`, url.origin));
  } else {
    const cfg = supabaseAuthConfig()!;
    const { verifier, challenge } = pkcePair();
    res = NextResponse.redirect(authorizeUrl(cfg.url, `${url.origin}/auth/callback`, challenge));
    res.cookies.set(PKCE_COOKIE, verifier, cookieOptions(10 * 60));
  }
  if (link) res.cookies.set(LINK_COOKIE, link, cookieOptions(10 * 60));
  else res.cookies.delete(LINK_COOKIE);
  return res;
}
