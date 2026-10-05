import { PlanGate } from "@/components/account/plan-gate";
import { JobsView } from "@/components/job/jobs-view";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job } = await searchParams;
  return (
    <PlanGate need="jobs">
      <JobsView selected={job} />
    </PlanGate>
  );
}
