import { PlanGate } from "@/components/account/plan-gate";
import { WhatsAppView } from "@/components/wa/whatsapp-view";

type Props = { searchParams: Promise<{ ch?: string; c?: string }> };

export default async function WhatsAppPage({ searchParams }: Props) {
  const { ch, c } = await searchParams;
  return (
    <PlanGate need="whatsapp">
      <WhatsAppView channelId={ch} conversationId={c} />
    </PlanGate>
  );
}
