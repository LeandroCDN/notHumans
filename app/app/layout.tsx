import { redirect } from "next/navigation";
import { Backdrop } from "@/components/backdrop";
import { AppHeader } from "@/components/app-header";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return (
    <>
      <Backdrop />
      <AppHeader user={user} />
      {children}
    </>
  );
}
