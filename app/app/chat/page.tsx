import { redirect } from "next/navigation";

// El test drive ahora vive en la sección notHumans.
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ nh?: string }> }) {
  const { nh } = await searchParams;
  redirect(nh ? `/app/explore?nh=${encodeURIComponent(nh)}` : "/app/explore");
}
