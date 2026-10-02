import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./nothumans";

// Links públicos para chatear con un notHuman sin cuenta (tabla nothuman_shares).

export type Share = { token: string; nothumanId: string; createdAt: number; replies: number; maxReplies: number };

export type ShareRepo = {
  /** El link activo de un notHuman, si tiene. */
  active(nothumanId: string): Promise<Share | null>;
  /** Crea el link (o devuelve el que ya estaba activo). */
  create(nothumanId: string, by: string): Promise<Share>;
  revoke(nothumanId: string): Promise<void>;
  /** Busca un link activo por token. */
  find(token: string): Promise<Share | null>;
  /** Cuenta una respuesta. Devuelve false si el link llegó al tope o ya no está activo. */
  use(token: string): Promise<boolean>;
};

/** 24 bytes al azar: imposible de adivinar, y cabe cómodo en un link. */
const newToken = () => randomBytes(24).toString("base64url");

type Row = { token: string; nothuman_id: string; created_at: string; replies: number; max_replies: number };
const fromRow = (r: Row): Share => ({
  token: r.token,
  nothumanId: r.nothuman_id,
  createdAt: Date.parse(r.created_at),
  replies: r.replies,
  maxReplies: r.max_replies,
});

function supabaseShares(db: SupabaseClient): ShareRepo {
  const fail = (what: string, error: { message: string }) => new Error(`Supabase (shares ${what}): ${error.message}`);
  const cols = "token, nothuman_id, created_at, replies, max_replies";
  const repo: ShareRepo = {
    async active(nothumanId) {
      const { data, error } = await db
        .from("nothuman_shares")
        .select(cols)
        .eq("nothuman_id", nothumanId)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw fail("active", error);
      return data ? fromRow(data as Row) : null;
    },
    async create(nothumanId, by) {
      const existing = await repo.active(nothumanId);
      if (existing) return existing;
      const { data, error } = await db
        .from("nothuman_shares")
        .insert({ token: newToken(), nothuman_id: nothumanId, created_by: by })
        .select(cols)
        .single();
      // Dos clics a la vez: el índice único deja uno solo activo; devolvemos ese.
      if (error?.code === "23505") return (await repo.active(nothumanId))!;
      if (error) throw fail("create", error);
      return fromRow(data as Row);
    },
    async revoke(nothumanId) {
      const { error } = await db
        .from("nothuman_shares")
        .update({ revoked_at: new Date().toISOString() })
        .eq("nothuman_id", nothumanId)
        .is("revoked_at", null);
      if (error) throw fail("revoke", error);
    },
    async find(token) {
      const { data, error } = await db.from("nothuman_shares").select(cols).eq("token", token).is("revoked_at", null).maybeSingle();
      if (error) throw fail("find", error);
      return data ? fromRow(data as Row) : null;
    },
    async use(token) {
      const { data, error } = await db.rpc("use_share", { p_token: token });
      if (error) throw fail("use", error);
      return !!data;
    },
  };
  return repo;
}

function memoryShares(): ShareRepo {
  const g = globalThis as unknown as { __nhShares?: Map<string, Share & { revoked: boolean }> };
  const items = (g.__nhShares ??= new Map());
  const live = () => [...items.values()].filter((s) => !s.revoked);
  const strip = ({ revoked: _, ...s }: Share & { revoked: boolean }): Share => s;
  return {
    async active(id) {
      const s = live().find((x) => x.nothumanId === id);
      return s ? strip(s) : null;
    },
    async create(id) {
      const s = live().find((x) => x.nothumanId === id);
      if (s) return strip(s);
      const share = { token: newToken(), nothumanId: id, createdAt: Date.now(), replies: 0, maxReplies: 300, revoked: false };
      items.set(share.token, share);
      return strip(share);
    },
    async revoke(id) {
      for (const s of live()) if (s.nothumanId === id) s.revoked = true;
    },
    async find(token) {
      const s = items.get(token);
      return s && !s.revoked ? strip(s) : null;
    },
    async use(token) {
      const s = items.get(token);
      if (!s || s.revoked || s.replies >= s.maxReplies) return false;
      s.replies++;
      return true;
    },
  };
}

let repo: ShareRepo | null = null;
export function shares(): ShareRepo {
  if (repo) return repo;
  const db = supabase();
  repo = db ? supabaseShares(db) : memoryShares();
  return repo;
}
