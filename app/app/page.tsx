import { Dashboard } from "@/components/dashboard";
import { getSessionUser } from "@/lib/auth";

export default async function AppHome() {
  const user = (await getSessionUser())!;
  return <Dashboard user={user} />;
}
