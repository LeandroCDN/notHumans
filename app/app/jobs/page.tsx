import { JobsView } from "@/components/job/jobs-view";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const { job } = await searchParams;
  return <JobsView selected={job} />;
}
