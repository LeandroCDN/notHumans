import { notFound } from "next/navigation";
import { AdminView } from "@/components/account/admin-view";
import { getSessionUser } from "@/lib/auth";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user?.admin) notFound();
  return <AdminView selfId={user.id} />;
}
