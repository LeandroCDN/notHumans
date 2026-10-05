import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Overrides, type PlanId, isPlanId, parseOverrides } from "@/lib/plans";
import { supabase } from "./nothumans";

// Perfiles de cuenta (tabla profiles). Se entra con Google (auth_user_id, de Supabase Auth) o con una cuenta
// fija de AUTH_USERS (legacy_login). Una cuenta fija puede vincular Google después y queda la misma cuenta.

export type Profile = {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  avatarUrl: string | null;
  plan: PlanId;
  planSource: string;
  planUntil: number | null;
  overrides: Overrides;
  accessRequestedAt: number | null;
  createdAt: number;
  legacyLogin: string | null;
  hasGoogle: boolean;
};

/** Lo que sabemos de alguien que entró con Google. */
export type GoogleIdentity = { authUserId: string; email: string; name: string; avatarUrl: string | null };

export type ProfileRepo = {
  get(id: string): Promise<Profile | null>;
  /** Busca (o crea) el perfil de una cuenta fija. Las cuentas fijas arrancan en Pro: eran invitados. */
  fromLegacy(login: string, admin: boolean): Promise<Profile>;
  /** Busca (o crea, en Free) el perfil de alguien que entró con Google. */
  fromGoogle(id: GoogleIdentity, admin: boolean): Promise<Profile>;
  /** Vincula Google a una cuenta existente. "taken" si esa cuenta de Google ya es de otro perfil. */
  linkGoogle(profileId: string, id: GoogleIdentity): Promise<"ok" | "taken">;
  list(): Promise<Profile[]>;
  setPlan(id: string, plan: PlanId, until: number | null): Promise<boolean>;
  requestAccess(id: string): Promise<void>;
};

/** "Leandro Dé" / "leandro.de@x.com" → "leandro_de": lo que se ve como @handle. */
export function handleBase(source: string): string {
  const base = source
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 18);
  return base.length >= 2 ? base : `nh_${base || "x"}`;
}

const withSuffix = (base: string) => `${base}_${randomInt(1000, 9999)}`;

type Row = {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  avatar_url: string | null;
  plan: string;
  plan_source: string;
  plan_until: string | null;
  overrides: unknown;
  access_requested_at: string | null;
  created_at: string;
  legacy_login: string | null;
  auth_user_id: string | null;
};

const fromRow = (r: Row): Profile => ({
  id: r.id,
  name: r.name,
  email: r.email,
  handle: r.handle,
  avatarUrl: r.avatar_url,
  plan: isPlanId(r.plan) ? r.plan : "free",
  planSource: r.plan_source,
  planUntil: r.plan_until ? Date.parse(r.plan_until) : null,
  overrides: parseOverrides(r.overrides),
  accessRequestedAt: r.access_requested_at ? Date.parse(r.access_requested_at) : null,
  createdAt: Date.parse(r.created_at),
  legacyLogin: r.legacy_login,
  hasGoogle: !!r.auth_user_id,
});

function supabaseProfiles(db: SupabaseClient): ProfileRepo {
  const fail = (what: string, error: { message: string }) => new Error(`Supabase (profiles ${what}): ${error.message}`);
  const one = async (col: string, value: string) => {
    const { data, error } = await db.from("profiles").select("*").eq(col, value).maybeSingle();
    if (error) throw fail("get", error);
    return data ? fromRow(data as Row) : null;
  };
  /** Inserta con un handle libre: si choca, prueba con un sufijo al azar. */
  const insert = async (row: Record<string, unknown>, handleFrom: string): Promise<Profile | null> => {
    const base = handleBase(handleFrom);
    for (let attempt = 0; attempt < 4; attempt++) {
      const handle = attempt === 0 ? base : withSuffix(base);
      const { data, error } = await db
        .from("profiles")
        .insert({ ...row, handle })
        .select("*")
        .single();
      if (!error) return fromRow(data as Row);
      if (error.code !== "23505") throw fail("create", error);
      // Otro choque que no es el handle (mismo login o misma cuenta de Google a la vez): que lo resuelva quien llama.
      if (!/handle/.test(error.message)) return null;
    }
    throw new Error("Supabase (profiles create): no hay handle libre");
  };
  const promote = async (p: Profile, admin: boolean) => {
    if (!admin || p.plan === "admin") return p;
    await db.from("profiles").update({ plan: "admin", plan_until: null }).eq("id", p.id);
    return { ...p, plan: "admin" as const, planUntil: null };
  };
  const repo: ProfileRepo = {
    get: (id) => one("id", id),
    async fromLegacy(login, admin) {
      const found = await one("legacy_login", login);
      if (found) return promote(found, admin);
      const created = await insert({ legacy_login: login, name: login, plan: admin ? "admin" : "pro" }, login);
      return created ?? (await one("legacy_login", login))!;
    },
    async fromGoogle(g, admin) {
      const found = await one("auth_user_id", g.authUserId);
      if (found) {
        // Nombre y foto pueden cambiar en Google: los refrescamos.
        await db
          .from("profiles")
          .update({ avatar_url: g.avatarUrl, email: g.email, last_seen_at: new Date().toISOString() })
          .eq("id", found.id);
        return promote({ ...found, avatarUrl: g.avatarUrl, email: g.email }, admin);
      }
      const row = { auth_user_id: g.authUserId, name: g.name.slice(0, 120), avatar_url: g.avatarUrl, plan: admin ? "admin" : "free" };
      const created = (await insert({ ...row, email: g.email }, g.email)) ?? (await one("auth_user_id", g.authUserId));
      // Ese mail ya figura en otro perfil (raro: otra cuenta de Google con el mismo mail): entra sin mail.
      return created ?? (await insert(row, g.email)) ?? (await one("auth_user_id", g.authUserId))!;
    },
    async linkGoogle(profileId, g) {
      const owner = await one("auth_user_id", g.authUserId);
      if (owner) return owner.id === profileId ? "ok" : "taken";
      const { error } = await db
        .from("profiles")
        .update({ auth_user_id: g.authUserId, email: g.email, avatar_url: g.avatarUrl })
        .eq("id", profileId);
      if (error?.code === "23505") return "taken";
      if (error) throw fail("link", error);
      return "ok";
    },
    async list() {
      const { data, error } = await db.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw fail("list", error);
      return (data as Row[]).map(fromRow);
    },
    async setPlan(id, plan, until) {
      const { data, error } = await db
        .from("profiles")
        .update({ plan, plan_source: "manual", plan_until: until ? new Date(until).toISOString() : null })
        .eq("id", id)
        .select("id");
      if (error) throw fail("set plan", error);
      return !!data?.length;
    },
    async requestAccess(id) {
      const { error } = await db
        .from("profiles")
        .update({ access_requested_at: new Date().toISOString() })
        .eq("id", id)
        .is("access_requested_at", null);
      if (error) throw fail("request access", error);
    },
  };
  return repo;
}

type MemoryProfile = Profile & { authUserId: string | null };

function memoryProfiles(): ProfileRepo {
  const g = globalThis as unknown as { __nhProfiles?: Map<string, MemoryProfile> };
  const items = (g.__nhProfiles ??= new Map<string, MemoryProfile>());
  const strip = ({ authUserId: _, ...p }: MemoryProfile): Profile => ({ ...p, hasGoogle: !!_ });
  const freeHandle = (from: string) => {
    const base = handleBase(from);
    const taken = (h: string) => [...items.values()].some((p) => p.handle === h);
    let h = base;
    while (taken(h)) h = withSuffix(base);
    return h;
  };
  const create = (p: Partial<MemoryProfile> & { name: string; plan: PlanId }, handleFrom: string): MemoryProfile => {
    const profile: MemoryProfile = {
      id: crypto.randomUUID(),
      email: null,
      avatarUrl: null,
      planSource: "manual",
      planUntil: null,
      overrides: {},
      accessRequestedAt: null,
      createdAt: Date.now(),
      legacyLogin: null,
      authUserId: null,
      hasGoogle: false,
      ...p,
      handle: freeHandle(handleFrom),
    };
    items.set(profile.id, profile);
    return profile;
  };
  const promote = (p: MemoryProfile, admin: boolean) => {
    if (admin) Object.assign(p, { plan: "admin", planUntil: null });
    return strip(p);
  };
  return {
    async get(id) {
      const p = items.get(id);
      return p ? strip(p) : null;
    },
    async fromLegacy(login, admin) {
      const found = [...items.values()].find((p) => p.legacyLogin === login);
      return promote(found ?? create({ legacyLogin: login, name: login, plan: "pro" }, login), admin);
    },
    async fromGoogle(id, admin) {
      const found = [...items.values()].find((p) => p.authUserId === id.authUserId);
      if (found) {
        Object.assign(found, { avatarUrl: id.avatarUrl, email: id.email });
        return promote(found, admin);
      }
      const p = create(
        { authUserId: id.authUserId, email: id.email, name: id.name.slice(0, 120), avatarUrl: id.avatarUrl, plan: "free" },
        id.email,
      );
      return promote(p, admin);
    },
    async linkGoogle(profileId, id) {
      const owner = [...items.values()].find((p) => p.authUserId === id.authUserId);
      if (owner) return owner.id === profileId ? "ok" : "taken";
      const p = items.get(profileId);
      if (p) Object.assign(p, { authUserId: id.authUserId, email: id.email, avatarUrl: id.avatarUrl });
      return "ok";
    },
    async list() {
      return [...items.values()].map(strip).sort((a, b) => b.createdAt - a.createdAt);
    },
    async setPlan(id, plan, until) {
      const p = items.get(id);
      if (!p) return false;
      Object.assign(p, { plan, planSource: "manual", planUntil: until });
      return true;
    },
    async requestAccess(id) {
      const p = items.get(id);
      if (p && !p.accessRequestedAt) p.accessRequestedAt = Date.now();
    },
  };
}

let repo: ProfileRepo | null = null;
export function profiles(): ProfileRepo {
  if (repo) return repo;
  const db = supabase();
  repo = db ? supabaseProfiles(db) : memoryProfiles();
  return repo;
}
