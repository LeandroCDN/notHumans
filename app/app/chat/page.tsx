import { TestDrive } from "@/components/chat/test-drive";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ nh?: string }> }) {
  const { nh } = await searchParams;
  return <TestDrive initialId={nh} />;
}
