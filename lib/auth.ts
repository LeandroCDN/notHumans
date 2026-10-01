import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "nh_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// AUTH_USERS="Human:pass,Invitado1:pass2" — cuentas fijas, sin sistema de usuarios.
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

function sign(name: string): string {
  return createHmac("sha256", secret()).update(name).digest("base64url");
}

/** Devuelve el nombre canónico de la cuenta si las credenciales son válidas. */
export function checkCredentials(user: string, password: string): string | null {
  const account = accounts().get(user.trim().toLowerCase());
  if (!account || !safeEqual(password, account.password)) return null;
  return account.name;
}

export function createSessionValue(name: string): string {
  return `${name}.${sign(name)}`;
}

function verifySessionValue(value: string): string | null {
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const name = value.slice(0, i);
  if (!safeEqual(value.slice(i + 1), sign(name))) return null;
  return accounts().get(name.toLowerCase())?.name ?? null;
}

export async function getSessionUser(): Promise<string | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE);
  return cookie ? verifySessionValue(cookie.value) : null;
}
