import { CreateJobDialog } from "@/components/create-job-dialog";
import { JobList } from "@/components/job-list";
import { PageHeading } from "@/components/page-heading";
export default function JobsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Delivery queue"
        title="All build jobs"
        description="Every request and its current position in the specialist delivery workflow."
        action={<CreateJobDialog />}
      />
      <JobList />
    </>
  );
}
