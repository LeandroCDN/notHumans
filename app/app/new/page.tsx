import { PlanGate } from "@/components/account/plan-gate";
import { CreateView } from "@/components/create/create-view";

export default function NewNotHuman() {
  return (
    <PlanGate need="create">
      <CreateView />
    </PlanGate>
  );
}
