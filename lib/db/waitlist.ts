import "server-only";
import { supabase } from "./nothumans";

// Lista de espera de la home (tabla waitlist). Sin Supabase, en desarrollo, queda en memoria.

/** Anota el mail. Si ya estaba, no pasa nada (no le contamos a nadie quién está anotado). */
export async function joinWaitlist(email: string, locale: string): Promise<void> {
  const db = supabase();
  if (!db) {
    const g = globalThis as unknown as { __nhWaitlist?: Set<string> };
    (g.__nhWaitlist ??= new Set()).add(email);
    return;
  }
  const { error } = await db.from("waitlist").insert({ email, locale });
  if (error && error.code !== "23505") throw new Error(`Supabase (waitlist): ${error.message}`);
}

export type WaitlistEntry = { email: string; locale: string; createdAt: number };

/** Para el panel de admin: los más nuevos primero. */
export async function listWaitlist(): Promise<WaitlistEntry[]> {
  const db = supabase();
  if (!db) {
    const g = globalThis as unknown as { __nhWaitlist?: Set<string> };
    return [...(g.__nhWaitlist ?? [])].map((email) => ({ email, locale: "en", createdAt: Date.now() }));
  }
  const { data, error } = await db.from("waitlist").select("email, locale, created_at").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(`Supabase (waitlist): ${error.message}`);
  return (data as { email: string; locale: string; created_at: string }[]).map((r) => ({
    email: r.email,
    locale: r.locale,
    createdAt: Date.parse(r.created_at),
  }));
}
