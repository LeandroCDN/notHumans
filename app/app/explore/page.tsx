import { NotHumansHub } from "@/components/nothuman/explore-view";

export default async function NotHumansPage({ searchParams }: { searchParams: Promise<{ nh?: string; tab?: string }> }) {
  const { nh, tab } = await searchParams;
  return <NotHumansHub initialId={nh} initialTab={tab} />;
}
