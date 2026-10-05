import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { GoogleIdentity } from "@/lib/db/profiles";

// "Entrar con Google" a través de Supabase Auth, con PKCE y sin guardar la sesión de Supabase:
// solo la usamos para saber quién es (id, mail, nombre, foto) y después manda nuestra propia cookie.
// 1. /auth/google → guardamos un `verifier` en una cookie y mandamos a Supabase con su `challenge`.
// 2. Supabase → Google → vuelve a /auth/callback?code=… → canjeamos code + verifier por el usuario.

export const PKCE_COOKIE = "nh_pkce";
export const LINK_COOKIE = "nh_link";

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizeUrl(supabaseUrl: string, redirectTo: string, challenge: string): string {
  const q = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: "s256",
  });
  return `${supabaseUrl}/auth/v1/authorize?${q}`;
}

type SupabaseUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
};

/** Lo que nos devuelve Supabase → lo que guardamos. Sin mail confirmado no entra (Google siempre lo confirma). */
export function identityFrom(user: SupabaseUser): GoogleIdentity | null {
  if (!user.id || !user.email || !user.email_confirmed_at) return null;
  const meta = user.user_metadata ?? {};
  const avatar = meta.avatar_url ?? meta.picture ?? null;
  return {
    authUserId: user.id,
    email: user.email.toLowerCase(),
    name: (meta.full_name ?? meta.name ?? user.email.split("@")[0]).trim().slice(0, 120),
    avatarUrl: avatar && /^https:\/\//.test(avatar) ? avatar : null,
  };
}

export async function exchangeCode(
  cfg: { url: string; key: string },
  code: string,
  verifier: string,
): Promise<GoogleIdentity | null> {
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: cfg.key, "content-type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!res.ok) {
    console.error("Supabase Auth: no se pudo canjear el código", res.status, await res.text().catch(() => ""));
    return null;
  }
  const body = (await res.json()) as { user?: SupabaseUser };
  return body.user ? identityFrom(body.user) : null;
}

/** Cuenta de prueba (sin Supabase): una identidad fija por mail, para probar el flujo entero sin Google. */
export function mockIdentity(email: string, name?: string): GoogleIdentity {
  const hex = createHash("sha256").update(email).digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return { authUserId: id, email, name: name || email.split("@")[0], avatarUrl: null };
}
