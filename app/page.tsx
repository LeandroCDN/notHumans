import { HomeView } from "@/components/home-view";
import { getSessionUser, loginMethods } from "@/lib/auth";
import { operator } from "@/lib/legal";

type Props = { searchParams: Promise<{ login?: string }> };

export default async function Home({ searchParams }: Props) {
  const user = await getSessionUser().catch(() => null);
  const { login } = await searchParams;
  return (
    <HomeView
      loggedIn={user !== null}
      methods={loginMethods()}
      loginError={login === "error" || login === "unavailable" ? login : undefined}
      contactEmail={operator().email}
    />
  );
}
