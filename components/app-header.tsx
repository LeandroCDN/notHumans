"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PlanId } from "@/lib/plans";
import { Avatar, PlanBadge } from "./account/avatar";
import { useI18n } from "./i18n";
import { LanguageSwitch } from "./language-switch";
import { Logo } from "./logo";

/** Lo que el header necesita de la cuenta (lo arma el server, en el layout). */
export type HeaderUser = { name: string; plan: PlanId; avatarUrl: string | null; admin: boolean; canLinkGoogle: boolean };

export function AppHeader({ user }: { user: HeaderUser }) {
  const path = usePathname();
  const { t } = useI18n();

  const nav = [
    { href: "/app/new", label: t.header.nav.create },
    { href: "/app/explore", label: t.header.nav.nothumans },
    { href: "/app/jobs", label: t.header.nav.jobs },
  ];

  return (
    <header className="relative z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-5 sm:px-10">
      <div className="flex items-center gap-6">
        <Link href="/app">
          <Logo className="text-2xl" />
        </Link>
        <nav className="flex gap-1 text-sm">
          {nav.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 transition ${
                  active ? "bg-acid/15 text-acid" : "text-white/55 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <LanguageSwitch />
        <AccountMenu user={user} />
      </div>
    </header>
  );
}

/** La cuenta arriba a la derecha: foto, nombre y plan; al tocarla, admin / vincular Google / salir. */
function AccountMenu({ user }: { user: HeaderUser }) {
  const router = useRouter();
  const { t } = useI18n();
  const ta = t.account;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const planLabel = ta.plans[user.plan] ?? user.plan;
  const item = "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/[0.06]";

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={ta.menu}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 font-mono text-xs backdrop-blur-md transition hover:border-white/25"
      >
        <Avatar name={user.name} url={user.avatarUrl} size="size-6" />
        <span className="max-w-28 truncate">{user.name}</span>
        <PlanBadge plan={user.plan} label={planLabel} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            style={{ originX: 1, originY: 0 }}
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-white/10 bg-[#111113]/95 p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={user.name} url={user.avatarUrl} size="size-9" />
              <div className="min-w-0">
                <p className="truncate text-sm">{user.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{ta.plan(planLabel)}</p>
              </div>
            </div>
            <div className="my-1 h-px bg-white/10" />
            {user.admin && (
              <Link href="/app/admin" onClick={() => setOpen(false)} className={item}>
                {ta.adminPanel} <span className="text-white/30">→</span>
              </Link>
            )}
            {user.canLinkGoogle && (
              <a href="/auth/google?link=1" className={item}>
                <span>
                  {ta.linkGoogle}
                  <span className="block text-[11px] text-white/40">{ta.linkGoogleSub}</span>
                </span>
                <span className="text-white/30">G</span>
              </a>
            )}
            <button onClick={() => void logout()} className={`${item} text-white/60 hover:text-rose`}>
              {t.header.logout}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
