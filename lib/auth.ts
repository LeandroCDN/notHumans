import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { type Profile, profiles } from "@/lib/db/profiles";
import { type Limits, type PlanId, effectivePlan } from "@/lib/plans";

// Sesión: una cookie firmada (HMAC con AUTH_SECRET) con el id del perfil. Se entra de dos formas:
// - Google, vía Supabase Auth (lib/oauth.ts). Cualquiera puede crear su cuenta; arranca en Free.
// - Cuentas fijas de AUTH_USERS ("Human:pass,Invitado:pass2"), de antes de que hubiera cuentas. Quedan
//   mientras AUTH_USERS esté configurado; desde adentro se les puede vincular Google.

export const SESSION_COOKIE = "nh_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

function accounts(): Map<string, { name: string; password: string }> {
  const map = new Map<string, { name: string; password: string }>();
  for (const entry of (process.env.AUTH_USERS ?? "").split(",")) {
    const i = entry.indexOf(":");
    if (i <= 0) continue;
    const name = entry.slice(0, i).trim();
    map.set(name.toLowerCase(), { name, password: entry.slice(i + 1).trim() });
  }
  return map;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Falta AUTH_SECRET en el entorno");
  return s;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Firma cualquier valor con AUTH_SECRET (sesión, tickets de generación, cookie de vincular). */
export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function verifySigned(value: string, signature: string): boolean {
  return safeEqual(signature, sign(value));
}

// --- Cómo se puede entrar -----------------------------------------------------------------------------

/** Supabase Auth: la misma URL del proyecto, con la publishable key (o la secret: esto corre en el server). */
export function supabaseAuthConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

/** Sin Supabase, en desarrollo o con LLM_MOCK=1: "Entrar con Google" crea una cuenta de prueba, sin Google. */
export function mockAuth(): boolean {
  return !process.env.SUPABASE_URL && (process.env.NODE_ENV !== "production" || process.env.LLM_MOCK === "1");
}

/** Google se prende con AUTH_GOOGLE=1, una vez configurado el proveedor en Supabase (si no, el botón daría error). */
export function googleEnabled(): boolean {
  return mockAuth() || (process.env.AUTH_GOOGLE === "1" && supabaseAuthConfig() !== null);
}

export function passwordEnabled(): boolean {
  return accounts().size > 0;
}

export type LoginMethods = { google: boolean; password: boolean };
export function loginMethods(): LoginMethods {
  return { google: googleEnabled(), password: passwordEnabled() };
}

/** Variables de entorno que faltan para que el login funcione. */
export function missingAuthConfig(): string[] {
  const missing: string[] = [];
  if (!passwordEnabled() && !googleEnabled()) missing.push("AUTH_USERS");
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
  return missing;
}

/** Devuelve el nombre canónico de la cuenta fija si las credenciales son válidas. */
export function checkCredentials(user: string, password: string): string | null {
  const account = accounts().get(user.trim().toLowerCase());
  if (!account || !safeEqual(password, account.password)) return null;
  return account.name;
}

/**
 * Quién es admin: los mails o cuentas fijas de ADMINS ("vos@gmail.com,Human"). Si ADMINS no está,
 * la primera cuenta de AUTH_USERS (así el dueño nunca queda afuera de su propio panel).
 */
export function isAdminIdentity(who: { email?: string | null; login?: string | null }): boolean {
  const list = (process.env.ADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) {
    const first = [...accounts().values()][0]?.name;
    return !!who.login && who.login === first;
  }
  return [who.email, who.login].some((v) => !!v && list.includes(v.toLowerCase()));
}

// --- Sesión ---------------------------------------------------------------------------------------------

export function createSessionValue(profileId: string): string {
  return `p.${profileId}.${sign(`session:${profileId}`)}`;
}

function verifySessionValue(value: string): string | null {
  const [kind, id, sig] = value.split(".");
  if (kind !== "p" || !id || !sig) return null;
  return verifySigned(`session:${id}`, sig) ? id : null;
}

export type SessionUser = Profile & { planId: PlanId; planExpired: boolean; limits: Limits; admin: boolean };

export function sessionFrom(p: Profile): SessionUser {
  const plan = effectivePlan(p);
  return { ...p, planId: plan.id, planExpired: plan.expired, limits: plan.limits, admin: plan.id === "admin" };
}

/** La cuenta de la sesión, con su plan vigente. Una sola consulta por request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE);
  const id = cookie && process.env.AUTH_SECRET ? verifySessionValue(cookie.value) : null;
  if (!id) return null;
  const p = await profiles().get(id);
  return p ? sessionFrom(p) : null;
});
