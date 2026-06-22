"use client";

import {
  Activity,
  Bot,
  CheckCircle2,
  FileCheck2,
  GitCommitHorizontal,
  Radio,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { useAppState } from "@/components/state-provider";
import { agents } from "@/lib/mock-data";
import { EmptyState } from "@/components/ui";
import { formatTime } from "@/lib/utils";

export default function ActivityPage() {
  const { state, hydrated } = useAppState();
  return (
    <>
      <PageHeading
        eyebrow="Immutable when anchored"
        title="Activity & audit timeline"
        description="A local, chronological record of requests, assignments, artifact submissions, reviews, and dossier generation."
        action={
          <div className="flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2 text-[10px] font-medium text-cyan">
            <Radio className="size-3 animate-pulse" />
            LOCAL EVENT STREAM
          </div>
        }
      />
      {!hydrated ? (
        <div className="surface h-72 animate-pulse" />
      ) : !state.events.length ? (
        <EmptyState
          title="No activity yet"
          description="Events will appear as jobs move through the delivery workflow."
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="grid border-b border-line bg-[#080d14] px-5 py-3 font-mono text-[9px] uppercase tracking-widest text-slate-700 sm:grid-cols-[150px_1fr_180px]">
            <span>Timestamp</span>
            <span>Event</span>
            <span className="hidden sm:block">Actor / reference</span>
          </div>
          {state.events.map((e, i) => {
            const agent = agents.find((a) => a.id === e.agentId);
            const Icon = e.type.includes("dossier")
              ? FileCheck2
              : e.type.includes("artifact")
                ? GitCommitHorizontal
                : e.type.includes("approved")
                  ? CheckCircle2
                  : e.agentId
                    ? Bot
                    : Activity;
            return (
              <div
                className="grid gap-4 border-b border-line p-5 last:border-0 sm:grid-cols-[150px_1fr_180px] sm:items-center"
                key={e.id}
              >
                <p className="font-mono text-[10px] text-slate-600">
                  {formatTime(e.timestamp)}
                </p>
                <div className="flex gap-3">
                  <div
                    className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border ${i === 0 ? "border-cyan/20 bg-cyan/5 text-cyan" : "border-line bg-[#080d14] text-slate-600"}`}
                  >
                    <Icon className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-300">
                      {e.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-600">
                      {e.description}
                    </p>
                  </div>
                </div>
                <div className="text-[10px] text-slate-600">
                  <p>{agent?.name || "Uzoma Lead Agent"}</p>
                  <p className="mt-1 font-mono text-slate-700">{e.jobId}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
