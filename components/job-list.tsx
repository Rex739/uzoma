"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, RadioTower } from "lucide-react";
import { useAppState } from "@/components/state-provider";
import { Badge, EmptyState } from "@/components/ui";
import { getCasperProofForJob } from "@/lib/casper/proof";
import {
  deriveJobStatus,
  getJobProgress,
  jobStatusMeta,
} from "@/lib/jobs/status";
import type { BuildDossier, BuildJob } from "@/lib/types";
import { formatTime } from "@/lib/utils";

type JobListProps = {
  compact?: boolean;
  jobs?: BuildJob[];
  dossiers?: BuildDossier[];
  emptyTitle?: string;
  emptyDescription?: string;
};

export function JobList({
  compact = false,
  jobs,
  dossiers,
  emptyTitle = "No build requests",
  emptyDescription = "Create a request to begin a structured agent workflow.",
}: JobListProps) {
  const { state, hydrated } = useAppState();
  const visibleJobs = jobs ?? state.jobs;
  const availableDossiers = dossiers ?? state.dossiers;

  if (!hydrated) return <div className="surface h-48 animate-pulse" />;
  if (!visibleJobs.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="surface overflow-hidden">
      {visibleJobs.slice(0, compact ? 3 : undefined).map((job) => {
        const status = deriveJobStatus(job, availableDossiers);
        const meta = jobStatusMeta[status];
        const progress = getJobProgress(job);
        const accepted = status === "accepted";
        const dossier = availableDossiers.find(
          (item) => item.id === job.dossierId,
        );
        const casperAnchored =
          dossier?.casperAnchorStatus === "confirmed" &&
          Boolean(getCasperProofForJob(job.id));

        return (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            aria-label={`Open ${job.title}, status ${meta.label}`}
            className="group grid gap-4 border-b border-line p-5 transition last:border-0 hover:bg-white/[.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-100 group-hover:text-cyan">
                  {job.title}
                </h3>
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <Badge>{job.contractType}</Badge>
                {job.agentMode === "live" && (
                  <Badge tone="cyan">Live agent planned</Badge>
                )}
                {casperAnchored && (
                  <Badge className="gap-1.5" tone="green">
                    <RadioTower className="size-3" />
                    Casper Testnet anchored
                  </Badge>
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-sm text-slate-500">
                {job.request}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
                <span className="font-mono">{job.id}</span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3" />
                  {formatTime(job.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="min-w-44">
                <div className="mb-2 flex justify-between gap-4 font-mono text-[9px] uppercase tracking-wider text-slate-600">
                  <span>
                    {accepted
                      ? "Delivery complete · dossier verified"
                      : `${progress.completed} of ${progress.total} stages complete`}
                  </span>
                  {!accepted && <span>{progress.percent}%</span>}
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-[width] duration-500 ${accepted ? "bg-gold" : "bg-cyan"}`}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-slate-700 group-hover:text-cyan" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
