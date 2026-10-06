import type { Metadata } from "next";
import Link from "next/link";
import { Backdrop } from "@/components/backdrop";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";

// Política de privacidad pública (sin login). Meta la pide para publicar la app de WhatsApp, y también es la
// página de "cómo borrar tus datos" (#borrar). El mail de contacto sale de CONTACT_EMAIL.

export const metadata: Metadata = { title: "Privacy · notHumans" };

export default async function PrivacyPage() {
  const t = dictionaries[await getLocale()].legal;
  const email = process.env.CONTACT_EMAIL?.trim();
  return (
    <>
      <Backdrop />
      <header className="flex items-center justify-between px-4 py-5 sm:px-10">
        <Link href="/">
          <Logo className="text-2xl" />
        </Link>
        <LanguageSwitch />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-10">
        <h1 className="font-serif text-5xl leading-none sm:text-6xl">
          {t.title} <em className="text-white/55">{t.accent}</em>
        </h1>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">{t.updated}</p>
        <p className="mt-8 text-lg text-white/70">{t.intro}</p>

        {t.sections.map((s) => (
          <section key={s.title} className="mt-10">
            <h2 className="font-serif text-3xl">{s.title}</h2>
            <ul className="mt-4 space-y-3">
              {s.items.map((item) => (
                <li key={item} className="flex gap-3 text-white/70">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-acid" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section id="borrar" className="mt-10 scroll-mt-10 rounded-[28px] border border-acid/30 bg-acid/[0.05] p-6">
          <h2 className="font-serif text-3xl">{t.deleteTitle}</h2>
          <ul className="mt-4 space-y-3">
            {t.deleteItems.map((item) => (
              <li key={item} className="flex gap-3 text-white/75">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-acid" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-3xl">{t.contactTitle}</h2>
          <p className="mt-3 text-white/70">
            {email ? (
              <>
                {t.contact(email).split(email)[0]}
                <a href={`mailto:${email}`} className="text-acid underline-offset-4 hover:underline">
                  {email}
                </a>
                {t.contact(email).split(email)[1]}
              </>
            ) : (
              t.contactFallback
            )}
          </p>
        </section>

        <Link href="/" className="mt-14 inline-block font-mono text-xs text-white/40 transition hover:text-acid">
          {t.back}
        </Link>
      </main>
    </>
  );
}
