import { HomeView } from "@/components/home-view";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  return <HomeView loggedIn={user !== null} />;
}
