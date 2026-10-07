import type { Metadata } from "next";
import { PricingView } from "@/components/pricing-view";

// La pestaña "Planes" de la app (el layout ya pidió la sesión).

export const metadata: Metadata = { title: "Pricing · notHumans" };

export default function AppPricingPage() {
  return <PricingView loggedIn />;
}
