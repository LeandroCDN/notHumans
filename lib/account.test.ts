import { beforeAll, describe, expect, it, vi } from "vitest";
import { PLANS, effectivePlan, monthlyLimit, parseOverrides, periodEnd, periodStart, toWire } from "./plans";

// Los módulos del server se pueden probar acá: sin Supabase configurado, todo queda en memoria.
vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("planes", () => {
  it("free no puede usar IA; admin no tiene topes", () => {
    expect(PLANS.free.generations).toBe(0);
    expect(PLANS.free.replies).toBe(0);
    expect(Number.isFinite(PLANS.admin.replies)).toBe(false);
    expect(PLANS.pro.nothumans).toBeLessThan(PLANS.business.nothumans);
  });

  it("un plan vencido se comporta como Free, sin overrides", () => {
    const now = Date.UTC(2026, 9, 5);
    const live = effectivePlan({ plan: "pro", planUntil: now + 1000, overrides: { replies: 10 } }, now);
    expect(live.id).toBe("pro");
    expect(live.limits.replies).toBe(10);
    const expired = effectivePlan({ plan: "pro", planUntil: now - 1000, overrides: { replies: 10 } }, now);
    expect(expired).toMatchObject({ id: "free", expired: true });
    expect(expired.limits.replies).toBe(0);
  });

  it("los overrides inválidos se ignoran", () => {
    expect(parseOverrides({ replies: 50, nothumans: "muchos", proModel: true, otra: 1 })).toEqual({ replies: 50, proModel: true });
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides("basura")).toEqual({});
  });

  it("el audio se cuenta en segundos; los pasos de una generación no tienen tope propio", () => {
    expect(monthlyLimit("audio", PLANS.pro)).toBe(PLANS.pro.audioMinutes * 60);
    expect(monthlyLimit("extract", PLANS.pro)).toBeNull();
    expect(monthlyLimit("reply", PLANS.pro)).toBe(2000);
  });

  it("sin tope viaja como null", () => {
    const w = toWire(PLANS.admin);
    expect(w.replies).toBeNull();
    expect(w.proModel).toBe(true);
    expect(JSON.parse(JSON.stringify(w)).nothumans).toBeNull();
  });

  it("el período es el mes calendario", () => {
    const d = new Date(Date.UTC(2026, 11, 31, 23, 59));
    expect(periodStart(d).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(periodEnd(d).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("consumo", () => {
  it("reserva hasta el tope, devuelve lo que falla y respeta el tope de costo", async () => {
    const { charge, metered, LimitError } = await import("./account");
    const user = { id: crypto.randomUUID(), limits: { ...PLANS.pro, replies: 2, costCapUsd: 1 } };

    const a = await charge(user, "reply");
    await a.done({ costUsd: 0.1 });
    // Una que falla se devuelve: no cuenta.
    await expect(metered(user, "reply", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const b = await charge(user, "reply");
    await b.done({ costUsd: 0.1 });
    await expect(charge(user, "reply")).rejects.toBeInstanceOf(LimitError);

    // El tope de costo corta todo, aunque el tipo no tenga tope propio.
    const big = await charge(user, "extract");
    await big.done({ costUsd: 5 });
    await expect(charge(user, "extract")).rejects.toMatchObject({ kind: "cost" });
  });

  it("free no puede ni una", async () => {
    const { charge } = await import("./account");
    await expect(charge({ id: crypto.randomUUID(), limits: PLANS.free }, "generation")).rejects.toMatchObject({
      kind: "generation",
      limit: 0,
    });
  });

  it("el audio reserva un segundo y después anota la duración real", async () => {
    const { charge } = await import("./account");
    const { usage } = await import("./db/usage");
    const user = { id: crypto.randomUUID(), limits: { ...PLANS.pro, audioMinutes: 1 } };
    const c = await charge(user, "audio");
    await c.done({ units: 59, costUsd: 0 });
    const ok = await charge(user, "audio"); // queda 1 segundo
    await ok.done({ units: 30, costUsd: 0 });
    await expect(charge(user, "audio")).rejects.toMatchObject({ kind: "audio" });
    expect((await usage().since(periodStart(), user.id)).get(user.id)?.units.audio).toBe(89);
  });
});

describe("tickets de generación", () => {
  it("sirven solo a su cuenta, vencen y mueren si la generación se devolvió", async () => {
    const { charge } = await import("./account");
    const { makeTicket, readTicket } = await import("./nothuman/ticket");
    const user = { id: crypto.randomUUID(), limits: PLANS.pro };
    const gen = await charge(user, "generation");
    const ticket = makeTicket(user.id, gen.id);

    expect(await readTicket(ticket, user.id)).toBe(gen.id);
    expect(await readTicket(ticket, crypto.randomUUID())).toBeNull();
    expect(await readTicket(ticket, user.id, Date.now() + 31 * 60 * 1000)).toBeNull();
    expect(await readTicket(ticket.replace(/.$/, "x"), user.id)).toBeNull();
    await gen.refund();
    expect(await readTicket(ticket, user.id)).toBeNull();
  });
});

describe("cuentas", () => {
  it("las cuentas fijas arrancan en Pro; Google en Free; vincular une las dos", async () => {
    const { profiles } = await import("./db/profiles");
    const legacy = await profiles().fromLegacy("Tester", false);
    expect(legacy.plan).toBe("pro");
    expect((await profiles().fromLegacy("Tester", false)).id).toBe(legacy.id);

    const g = { authUserId: crypto.randomUUID(), email: "ana@x.com", name: "Ana", avatarUrl: null };
    const ana = await profiles().fromGoogle(g, false);
    expect(ana).toMatchObject({ plan: "free", hasGoogle: true, handle: "ana" });
    expect((await profiles().fromGoogle(g, false)).id).toBe(ana.id);

    // La cuenta de Google de Ana ya tiene perfil: no se puede vincular a otra.
    expect(await profiles().linkGoogle(legacy.id, g)).toBe("taken");
    const other = { ...g, authUserId: crypto.randomUUID(), email: "tester@x.com" };
    expect(await profiles().linkGoogle(legacy.id, other)).toBe("ok");
    expect((await profiles().fromGoogle(other, false)).id).toBe(legacy.id);
  });

  it("el admin se decide por ADMINS (mail o cuenta fija), o es la primera de AUTH_USERS", async () => {
    const { isAdminIdentity } = await import("./auth");
    process.env.AUTH_USERS = "Human:pw,Otro:pw2";
    delete process.env.ADMINS;
    expect(isAdminIdentity({ login: "Human" })).toBe(true);
    expect(isAdminIdentity({ login: "Otro" })).toBe(false);
    expect(isAdminIdentity({ email: "yo@x.com" })).toBe(false);
    process.env.ADMINS = "Yo@X.com";
    expect(isAdminIdentity({ email: "yo@x.com" })).toBe(true);
    expect(isAdminIdentity({ login: "Human" })).toBe(false);
  });

  it("los handles salen del mail, sin acentos ni símbolos", async () => {
    const { handleBase } = await import("./db/profiles");
    expect(handleBase("José.Pérez+ventas@gmail.com")).toBe("jose_perez_ventas");
    expect(handleBase("a@x.com")).toBe("nh_a");
  });
});

describe("Google", () => {
  it("sin mail confirmado no entra; la foto tiene que ser https", async () => {
    const { identityFrom, pkcePair } = await import("./oauth");
    const base = { id: crypto.randomUUID(), email: "Ana@X.com", email_confirmed_at: "2026-10-05" };
    expect(identityFrom({ ...base, user_metadata: { full_name: "Ana P", avatar_url: "https://x/a.png" } })).toMatchObject({
      email: "ana@x.com",
      name: "Ana P",
      avatarUrl: "https://x/a.png",
    });
    expect(identityFrom({ ...base, email_confirmed_at: null })).toBeNull();
    expect(identityFrom({ ...base, user_metadata: { picture: "javascript:alert(1)" } })?.avatarUrl).toBeNull();
    const { verifier, challenge } = pkcePair();
    expect(verifier).not.toBe(challenge);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
