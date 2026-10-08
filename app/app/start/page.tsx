import { PlanGate } from "@/components/account/plan-gate";
import { StartView } from "@/components/start/start-view";

// El recorrido guiado para el primer notHuman (los mismos objetos que la app, en 5 pasos).
export default function Start() {
  return (
    <PlanGate need="create">
      <StartView />
    </PlanGate>
  );
}
