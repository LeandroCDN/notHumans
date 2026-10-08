import type { Metadata } from "next";
import Link from "next/link";
import { Backdrop } from "@/components/backdrop";
import { LanguageSwitch } from "@/components/language-switch";
import { SiteFooter } from "@/components/legal/site-footer";
import { Logo } from "@/components/logo";
import { PricingView } from "@/components/pricing-view";
import { getSessionUser } from "@/lib/auth";
import { operator } from "@/lib/legal";

// Los planes, públicos (sin login): para mostrarlos. Con sesión, la misma vista vive en /app/pricing.

export const metadata: Metadata = { title: "Pricing · notHumans" };

export default async function PricingPage() {
  const user = await getSessionUser();
  return (
    <>
      <Backdrop />
      <header className="flex items-center justify-between px-4 py-5 sm:px-10">
        <Link href={user ? "/app" : "/"}>
          <Logo className="text-2xl" />
        </Link>
        <LanguageSwitch />
      </header>
      <PricingView loggedIn={!!user} />
      <SiteFooter email={operator().email} />
    </>
  );
}
