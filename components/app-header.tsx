"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "./i18n";
import { LanguageSwitch } from "./language-switch";
import { Logo } from "./logo";

export function AppHeader({ user }: { user: string }) {
  const router = useRouter();
  const { t } = useI18n();
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="relative z-40 flex items-center justify-between px-4 py-5 sm:px-10">
      <Link href="/app">
        <Logo className="text-2xl" />
      </Link>
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
