import { CreateJobDialog } from "@/components/create-job-dialog";
import { JobList } from "@/components/job-list";
import { PageHeading } from "@/components/page-heading";

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<{ deleted?: string }>;
}) {
  const params = await searchParams;
  const deleted = params?.deleted === "local-job";
  return (
    <>
      <PageHeading
        eyebrow="Delivery queue"
        title="All build jobs"
        description="Every request and its current position in the specialist delivery workflow."
        action={<CreateJobDialog />}
      />
      {deleted && (
        <div
          className="mb-5 rounded-xl border border-emerald/20 bg-emerald/[.055] px-4 py-3 text-xs font-medium text-emerald"
          role="status"
        >
          Local job deleted from this browser.
        </div>
      )}
      <JobList />
    </>
  );
}
