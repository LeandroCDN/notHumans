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
