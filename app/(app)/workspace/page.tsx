"use client";

import { Activity, Bot, CheckCircle2, FileText, Zap } from "lucide-react";
import { CreateJobDialog } from "@/components/create-job-dialog";
import { JobList } from "@/components/job-list";
import { PageHeading } from "@/components/page-heading";
import { useAppState } from "@/components/state-provider";
import { agents } from "@/lib/mock-data";
import { formatTime } from "@/lib/utils";

export default function WorkspacePage() {
  const { state } = useAppState();
  const stats = [
    {
      label: "Active jobs",
      value: state.jobs.filter((j) => !j.dossierId).length,
      icon: Zap,
    },
    { label: "Agents online", value: 4, icon: Bot },
    {
      label: "Artifacts delivered",
      value: state.jobs.flatMap((j) => j.stages).filter((s) => s.artifact)
        .length,
      icon: FileText,
    },
    {
      label: "Accepted dossiers",
      value: state.dossiers.length,
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
            <h2 className="text-sm font-semibold">Current build requests</h2>
            <span className="font-mono text-[10px] text-slate-600">
              LOCAL STATE
            </span>
          </div>
          <JobList compact />
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
                <span className="ml-auto size-1.5 rounded-full bg-emerald" />
              </div>
            ))}
          </div>
          <div className="mt-5 surface p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Activity className="size-4 text-cyan" />
              Latest system event
            </div>
            {state.events[0] ? (
              <>
                <p className="mt-3 text-xs text-slate-400">
                  {state.events[0].title}
                </p>
                <p className="mt-1 font-mono text-[9px] text-slate-700">
                  {formatTime(state.events[0].timestamp)}
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
