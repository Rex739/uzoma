import {
  isLegacyStaticDossierEvidence,
  isPreservedDemoEscrowDossier,
} from "@/lib/casper/live-proof";
import type { AppState, BuildDossier, BuildJob } from "@/lib/types";

function relatedDossiers(job: BuildJob, dossiers: BuildDossier[]) {
  return dossiers.filter(
    (dossier) => dossier.jobId === job.id || dossier.id === job.dossierId,
  );
}

export function canDeleteLocalJob(job: BuildJob, dossiers: BuildDossier[]) {
  if (job.id === "demo-escrow") return false;
  const matches = relatedDossiers(job, dossiers);
  return matches.every(
    (dossier) =>
      dossier.casperAnchorStatus !== "confirmed" &&
      !isLegacyStaticDossierEvidence(dossier) &&
      !isPreservedDemoEscrowDossier(dossier),
  );
}

export function deleteLocalJobFromState(state: AppState, jobId: string) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job || !canDeleteLocalJob(job, state.dossiers)) {
    return { state, deleted: false };
  }
  return {
    deleted: true,
    state: {
      ...state,
      jobs: state.jobs.filter((item) => item.id !== jobId),
      dossiers: state.dossiers.filter(
        (dossier) => dossier.jobId !== jobId && dossier.id !== job.dossierId,
      ),
      events: state.events.filter((event) => event.jobId !== jobId),
    },
  };
}
