"use client";

import Link from "next/link";
import { useI18n } from "../i18n";

/** El pie de las páginas públicas: © notHumans, Términos, Privacidad y el mail de contacto. */
export function SiteFooter({ email }: { email: string | null }) {
  const t = useI18n().t.footer;
  const link = "transition hover:text-acid";
  return (
    <footer className="relative z-10 flex flex-col items-center justify-between gap-3 px-6 py-10 font-mono text-[11px] text-white/35 sm:flex-row sm:px-10">
      <span>© {new Date().getFullYear()} notHumans</span>
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <Link href="/terms" className={link}>
          {t.terms}
        </Link>
        <Link href="/privacy" className={link}>
          {t.privacy}
        </Link>
        {email && (
          <a href={`mailto:${email}`} className={link}>
            {email}
          </a>
        )}
      </nav>
    </footer>
  );
}

/** "notHumans es un servicio operado por …, … Contacto: …". */
export function OperatorLine({
  name,
  location,
  email,
}: {
  name: string | null;
  location: string | null;
  email: string | null;
}) {
  const t = useI18n().t.footer;
  if (!name) return null;
  return (
    <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
      {t.operator(name, location, email)}
    </p>
  );
}
