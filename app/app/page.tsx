import { Dashboard } from "@/components/dashboard";
import { getSessionUser } from "@/lib/auth";

type Props = { searchParams: Promise<{ linked?: string }> };

export default async function AppHome({ searchParams }: Props) {
  const user = (await getSessionUser())!;
  const { linked } = await searchParams;
  return <Dashboard name={user.name} linked={linked} />;
}
