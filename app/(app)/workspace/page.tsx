"use client";

import { Activity, Bot, CheckCircle2, FileText, Zap } from "lucide-react";
import { CreateJobDialog } from "@/components/create-job-dialog";
import { JobList } from "@/components/job-list";
import { PageHeading } from "@/components/page-heading";
import { useAppState } from "@/components/state-provider";
import {
  countsTowardActiveJobs,
  deriveJobStatus,
  getDeliveredArtifacts,
  isOpenJobStatus,
} from "@/lib/jobs/status";
import { agents } from "@/lib/mock-data";
import { formatTime } from "@/lib/utils";

export default function WorkspacePage() {
  const { state } = useAppState();
  const classifiedJobs = state.jobs.map((job) => ({
    job,
    status: deriveJobStatus(job, state.dossiers),
  }));
  const activeJobs = classifiedJobs
    .filter(({ status }) => isOpenJobStatus(status))
    .map(({ job }) => job);
  const acceptedJobs = classifiedJobs
    .filter(({ status }) => status === "accepted")
    .map(({ job }) => job);
  const latestEvent = [...state.events].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  )[0];
  const stats = [
    {
      label: "Active jobs",
      value: classifiedJobs.filter(({ status }) =>
        countsTowardActiveJobs(status),
      ).length,
      icon: Zap,
    },
    {
      label: "Agents online",
      value: agents.filter((agent) => agent.availability === "Online").length,
      icon: Bot,
    },
    {
      label: "Artifacts delivered",
      value: state.jobs.reduce(
        (total, job) => total + getDeliveredArtifacts(job).length,
        0,
      ),
      icon: FileText,
    },
    {
      label: "Accepted dossiers",
      value: classifiedJobs.filter(({ status }) => status === "accepted")
        .length,
      icon: CheckCircle2,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="Core Protocol Workspace"
        title="Delivery control center"
        description="Commission contract work, watch specialist handoffs, and inspect the evidence behind every accepted delivery."
        action={<CreateJobDialog />}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div className="surface p-5" key={label}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{label}</span>
              <Icon className="size-4 text-slate-600" />
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight text-white">
              {String(value).padStart(2, "0")}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Active build requests</h2>
            <span className="font-mono text-[10px] text-slate-600">
              LOCAL STATE
            </span>
          </div>
          <JobList
            jobs={activeJobs}
            dossiers={state.dossiers}
            emptyTitle="No active build requests"
            emptyDescription="No active build requests. Create a request to begin a verified delivery workflow."
          />
          <div className="mb-4 mt-8 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Recent accepted deliveries
            </h2>
            <span className="font-mono text-[10px] text-gold/70">
              VERIFIED LOCALLY
            </span>
          </div>
          <JobList jobs={acceptedJobs} dossiers={state.dossiers} compact />
        </section>
        <aside>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Agent network</h2>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald">
              <span className="size-1.5 rounded-full bg-emerald" />
              OPERATIONAL
            </span>
          </div>
          <div className="surface divide-y divide-line">
            {agents.map((a) => (
              <div className="flex items-center gap-3 p-4" key={a.id}>
                <div className="grid size-9 place-items-center rounded-lg border border-line bg-[#080d14] font-mono text-xs text-cyan">
                  {a.name[0]}
                </div>
                <div>
                  <p className="text-xs font-semibold">{a.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{a.role}</p>
                </div>
                <span
                  className={`ml-auto size-1.5 rounded-full ${a.availability === "Online" ? "bg-emerald" : "bg-slate-600"}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-5 surface p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Activity className="size-4 text-cyan" />
              Latest system event
            </div>
            {latestEvent ? (
              <>
                <p className="mt-3 text-xs text-slate-400">
                  {latestEvent.title}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  {latestEvent.description}
                </p>
                <p className="mt-1 font-mono text-[9px] text-slate-700">
                  {formatTime(latestEvent.timestamp)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-slate-600">No events yet.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
