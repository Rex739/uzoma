import type { BuildDossier, BuildJob, DeliveryArtifact } from "@/lib/types";

export type DerivedJobStatus =
  | "draft"
  | "active"
  | "review-ready"
  | "dossier-pending"
  | "accepted"
  | "blocked";

export type JobStatusTone =
  | "slate"
  | "cyan"
  | "blue"
  | "amber"
  | "gold"
  | "red";

export const jobStatusMeta: Record<
  DerivedJobStatus,
  { label: string; tone: JobStatusTone }
> = {
  draft: { label: "Draft", tone: "slate" },
  active: { label: "Active", tone: "cyan" },
  "review-ready": { label: "Review ready", tone: "blue" },
  "dossier-pending": { label: "Dossier pending", tone: "amber" },
  accepted: { label: "Accepted", tone: "gold" },
  blocked: { label: "Blocked", tone: "red" },
};

const reviewPrerequisiteIds = ["requested", "planning", "building", "testing"];
const deliveryStageIds = [
  "planning",
  "building",
  "testing",
  "reviewing",
  "accepted",
  "dossier",
];

function hasApprovedDossier(job: BuildJob, dossiers: BuildDossier[]) {
  return dossiers.some(
    (dossier) =>
      dossier.id === job.dossierId &&
      dossier.jobId === job.id &&
      dossier.finalApproval === "Approved",
  );
}

export function deriveJobStatus(
  job: BuildJob,
  dossiers: BuildDossier[] = [],
): DerivedJobStatus {
  const stage = (id: string) => job.stages.find((item) => item.id === id);

  if (
    stage("dossier")?.status === "completed" &&
    hasApprovedDossier(job, dossiers)
  ) {
    return "accepted";
  }
  if (job.stages.some((item) => item.status === "blocked")) return "blocked";

  const review = stage("reviewing");
  const prerequisitesComplete = reviewPrerequisiteIds.every(
    (id) => stage(id)?.status === "completed",
  );

  if (review?.status === "completed") return "dossier-pending";
  if (
    prerequisitesComplete &&
    (review?.status === "queued" || review?.status === "active")
  ) {
    return "review-ready";
  }

  const deliveryHasStarted = deliveryStageIds.some((id) => {
    const status = stage(id)?.status;
    return status === "active" || status === "completed";
  });

  return deliveryHasStarted ? "active" : "draft";
}

export function isOpenJobStatus(status: DerivedJobStatus) {
  return status !== "accepted";
}

export function countsTowardActiveJobs(status: DerivedJobStatus) {
  return (
    status === "active" ||
    status === "review-ready" ||
    status === "dossier-pending" ||
    status === "blocked"
  );
}

export function getJobProgress(job: BuildJob) {
  const stages = job.stages.filter((stage) =>
    deliveryStageIds.includes(stage.id),
  );
  const completed = stages.filter(
    (stage) => stage.status === "completed",
  ).length;
  const total = stages.length;

  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function getDeliveredArtifacts(job: BuildJob): DeliveryArtifact[] {
  return job.stages.flatMap((stage) =>
    stage.status === "completed" && stage.artifact ? [stage.artifact] : [],
  );
}
