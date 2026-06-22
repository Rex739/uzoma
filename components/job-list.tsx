"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { useAppState } from "@/components/state-provider";
import { Badge, EmptyState } from "@/components/ui";
import { formatTime } from "@/lib/utils";

export function JobList({ compact = false }: { compact?: boolean }) {
  const { state, hydrated } = useAppState();
  if (!hydrated) return <div className="surface h-48 animate-pulse" />;
  if (!state.jobs.length)
    return (
      <EmptyState
        title="No build requests"
        description="Create a request to begin a structured agent workflow."
      />
    );
  return (
    <div className="surface overflow-hidden">
      {state.jobs.slice(0, compact ? 3 : undefined).map((job, i) => {
        const done = job.stages.filter((s) => s.status === "completed").length;
        return (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            className="group grid gap-4 border-b border-line p-5 transition last:border-0 hover:bg-white/[.02] sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-100 group-hover:text-cyan">
                  {job.title}
                </h3>
                {i === 0 && <Badge tone="cyan">Active</Badge>}
                <Badge>{job.contractType}</Badge>
              </div>
              <p className="mt-2 line-clamp-1 text-sm text-slate-500">
                {job.request}
              </p>
              <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-600">
                <span className="font-mono">{job.id}</span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3" />
                  {formatTime(job.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="min-w-28">
                <div className="mb-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-slate-600">
                  <span>{job.status}</span>
                  <span>{done}/7</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-cyan"
                    style={{ width: `${(done / 7) * 100}%` }}
                  />
                </div>
              </div>
              <ArrowUpRight className="size-4 text-slate-700 group-hover:text-cyan" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
