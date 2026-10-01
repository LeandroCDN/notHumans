import { NotHumanDetail } from "@/components/nothuman/explore-view";

export default async function NotHumanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NotHumanDetail id={id} />;
}
