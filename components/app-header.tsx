"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "./i18n";
import { LanguageSwitch } from "./language-switch";
import { Logo } from "./logo";

export function AppHeader({ user }: { user: string }) {
  const router = useRouter();
  const path = usePathname();
  const { t } = useI18n();
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

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
        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs backdrop-blur-md">
          <span className="size-1.5 rounded-full bg-acid shadow-[0_0_8px_var(--color-acid)]" />
          {user}
        </span>
        <button onClick={logout} className="font-mono text-xs text-white/40 transition hover:text-rose">
          {t.header.logout}
        </button>
      </div>
    </header>
  );
}
