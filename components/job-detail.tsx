"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Code2,
  FileCheck2,
  FileCode2,
  ListChecks,
  LockKeyhole,
  Play,
  RadioTower,
  ShieldCheck,
  TestTube2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppState } from "@/components/state-provider";
import { Badge, Button, CopyButton, EmptyState } from "@/components/ui";
import { getCasperProofForJob } from "@/lib/casper/proof";
import {
  deriveJobStatus,
  getJobProgress,
  jobStatusMeta,
} from "@/lib/jobs/status";
import { agents } from "@/lib/mock-data";
import type { DeliveryArtifact, JobStage, StageStatus } from "@/lib/types";
import { cn, shortHash } from "@/lib/utils";

const stageIcons = {
  planning: FileCheck2,
  building: Code2,
  testing: TestTube2,
  reviewing: ShieldCheck,
  accepted: CheckCircle2,
  dossier: FileCode2,
};

const statusStyles: Record<StageStatus, string> = {
  queued: "border-line bg-[#090e15] text-slate-600",
  active:
    "border-cyan/50 bg-cyan/[.07] text-cyan shadow-[0_0_28px_rgba(35,213,245,.09)]",
  completed: "border-emerald/25 bg-emerald/[.05] text-emerald",
  blocked: "border-red-500/35 bg-red-500/[.07] text-red-300",
};

function toneFor(stage: JobStage) {
  if (stage.status === "blocked") return "red" as const;
  if (
    (stage.id === "accepted" || stage.id === "dossier") &&
    stage.status !== "queued"
  )
    return "gold" as const;
  if (stage.status === "active") return "cyan" as const;
  if (stage.status === "completed") return "green" as const;
  return "slate" as const;
}

function visualFor(stage: JobStage) {
  if (
    (stage.id === "accepted" || stage.id === "dossier") &&
    stage.status !== "queued"
  )
    return "border-gold/40 bg-gold/[.07] text-gold shadow-[0_0_24px_rgba(233,185,73,.08)]";
  return statusStyles[stage.status];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : [];
}

function SpecificationPreview({ artifact }: { artifact: DeliveryArtifact }) {
  const requirements = asStringArray(artifact.metadata?.requirements);
  const roles = asStringArray(artifact.metadata?.roles);
  const transitions = asStringArray(artifact.metadata?.transitions);
  const invariants = asStringArray(artifact.metadata?.invariants);
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-[#070b11]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-cyan">
            Contract requirements
          </p>
          <p className="mt-1 text-xs font-semibold text-white">
            Milestone Escrow · v{String(artifact.metadata?.version || "1.0")}
          </p>
        </div>
        <Badge tone="green">Ready for build</Badge>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-2">
        {[
          ["Functional requirements", requirements, ListChecks],
          ["Actors & authority", roles, UserRound],
          ["State transitions", transitions, ArrowRight],
          ["Contract invariants", invariants, ShieldCheck],
        ].map(([title, items, Icon]) => {
          const C = Icon as typeof ListChecks;
          return (
            <div className="bg-[#090e15] p-4" key={String(title)}>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
                <C className="size-3.5 text-cyan" />
                {String(title)}
              </div>
              <div className="mt-3 space-y-2">
                {(items as string[]).map((item) => (
                  <div
                    className="flex gap-2 text-[10px] leading-5 text-slate-500"
                    key={item}
                  >
                    <Check className="mt-1 size-3 shrink-0 text-emerald" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RustPreview({ artifact }: { artifact: DeliveryArtifact }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-[#05080d]">
      <div className="flex items-center justify-between border-b border-line bg-[#090e15] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald" />
          <span className="font-mono text-[10px] text-slate-400">
            milestone_escrow.rs
          </span>
        </div>
        <Badge>Preview · not deployed</Badge>
      </div>
      <pre className="max-h-[420px] overflow-auto p-4 font-mono text-[11px] leading-6">
        {artifact.content.split("\n").map((line, index) => {
          const trimmed = line.trim();
          const color = trimmed.startsWith("//")
            ? "text-emerald/70"
            : trimmed.startsWith("#[")
              ? "text-gold"
              : /\b(pub|struct|impl|fn|if)\b/.test(line)
                ? "text-cyan"
                : "text-slate-300";
          return (
            <div className="flex" key={`${index}-${line}`}>
              <span className="mr-5 w-5 shrink-0 select-none text-right text-slate-800">
                {index + 1}
              </span>
              <code className={color}>{line || " "}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function TestPreview({ artifact }: { artifact: DeliveryArtifact }) {
  const tests = asStringArray(artifact.metadata?.testNames);
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-emerald/20 bg-emerald/[.05] p-3">
          <p className="eyebrow">Result</p>
          <p className="mt-2 text-lg font-semibold text-emerald">
            {String(artifact.metadata?.tests || 8)}/8
          </p>
          <p className="text-[9px] text-slate-600">tests passed</p>
        </div>
        <div className="rounded-lg border border-cyan/20 bg-cyan/[.04] p-3">
          <p className="eyebrow">Coverage</p>
          <p className="mt-2 text-lg font-semibold text-cyan">
            {String(artifact.metadata?.coverage || 94)}%
          </p>
          <p className="text-[9px] text-slate-600">reported</p>
        </div>
        <div className="rounded-lg border border-gold/20 bg-gold/[.04] p-3">
          <p className="eyebrow">Edge cases</p>
          <p className="mt-2 text-lg font-semibold text-gold">1</p>
          <p className="text-[9px] text-slate-600">rejected safely</p>
        </div>
      </div>
      <div className="rounded-lg border border-line bg-[#070b11] p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {tests.map((test) => (
            <div
              className="flex items-center gap-2 font-mono text-[10px] text-slate-400"
              key={test}
            >
              <CheckCircle2 className="size-3.5 text-emerald" />
              {test}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3 rounded-md border border-gold/20 bg-gold/[.05] p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
              Rejected edge case
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              {String(
                artifact.metadata?.rejected ||
                  "Invalid pre-approval release was rejected.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewPreview({ artifact }: { artifact: DeliveryArtifact }) {
  const checklist = asStringArray(artifact.metadata?.checklist);
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-gold/20 bg-gold/[.035]">
      <div className="flex flex-col justify-between gap-3 border-b border-gold/15 p-4 sm:flex-row sm:items-center">
        <div>
          <p className="eyebrow">Independent acceptance review</p>
          <p className="mt-1 text-xs text-slate-400">
            Verity · evidence-based assessment
          </p>
        </div>
        <Badge tone="gold">
          Final recommendation ·{" "}
          {String(artifact.metadata?.recommendation || "APPROVED")}
        </Badge>
      </div>
      <div className="space-y-3 p-4">
        {checklist.map((item) => (
          <div className="flex items-center gap-3" key={item}>
            <div className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald/10">
              <Check className="size-3 text-emerald" />
            </div>
            <p className="text-[11px] text-slate-300">{item}</p>
            <span className="ml-auto font-mono text-[9px] text-emerald">
              APPROVED
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-gold/15 px-4 py-3 text-[10px] text-slate-500">
        Findings:{" "}
        <span className="font-mono text-slate-300">
          {String(artifact.metadata?.findings || "0 critical")}
        </span>
      </div>
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: DeliveryArtifact }) {
  if (artifact.type === "specification")
    return <SpecificationPreview artifact={artifact} />;
  if (artifact.type === "implementation")
    return <RustPreview artifact={artifact} />;
  if (artifact.type === "test-report")
    return <TestPreview artifact={artifact} />;
  return <ReviewPreview artifact={artifact} />;
}

export function JobDetail({ id }: { id: string }) {
  const { state, hydrated, runNextStage, createDossier } = useAppState();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const job = state.jobs.find((item) => item.id === id);
  if (!hydrated) return <div className="surface h-96 animate-pulse" />;
  if (!job)
    return (
      <EmptyState
        title="Build job not found"
        description="This local job does not exist or the demo state was reset."
      />
    );

  const active = job.stages.find((stage) => stage.status === "active");
  const deliveryStages = job.stages.filter((stage) => stage.id !== "requested");
  const jobProgress = getJobProgress(job);
  const derivedStatus = deriveJobStatus(job, state.dossiers);
  const statusMeta = jobStatusMeta[derivedStatus];
  const canDossier = active?.id === "accepted";
  const artifacts = job.stages.flatMap((stage) =>
    stage.artifact ? [stage.artifact] : [],
  );
  const activeAgent = agents.find((agent) => agent.id === active?.agentId);
  const dossierRecord = state.dossiers.find(
    (dossier) => dossier.id === job.dossierId,
  );
  const casperProof =
    dossierRecord?.casperAnchorStatus === "confirmed"
      ? getCasperProofForJob(job.id)
      : undefined;

  function run() {
    setRunning(true);
    setTimeout(() => {
      runNextStage(id);
      setRunning(false);
    }, 650);
  }
  function dossier() {
    const dossierId = createDossier(id);
    if (dossierId) router.push(`/dossier/${dossierId}`);
  }

  return (
    <>
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-white"
      >
        <ArrowLeft className="size-3" />
        All jobs
      </Link>

      <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            <Badge>{job.priority} priority</Badge>
            {casperProof && <Badge tone="green">Testnet anchored</Badge>}
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
              {job.id}
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {job.title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {job.contractType} contract delivery · local deterministic workflow
          </p>
        </div>
        <div className="flex shrink-0">
          {job.dossierId ? (
            <Button asChild variant="gold" size="lg">
              <Link href={`/dossier/${job.dossierId}`}>
                Open Build Dossier <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : canDossier ? (
            <Button variant="gold" size="lg" onClick={dossier}>
              Create Build Dossier <FileCheck2 className="size-4" />
            </Button>
          ) : (
            <Button
              className="min-w-48 shadow-[0_0_28px_rgba(35,213,245,.16)]"
              size="lg"
              onClick={run}
              loading={running}
              disabled={!active || active.id === "dossier"}
            >
              {running ? "Running stage…" : "Run Next Stage"}
              <Play className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex flex-col justify-between gap-4 border-b border-line p-5 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">Delivery progress</p>
            <p className="mt-2 text-sm font-semibold text-white">
              {jobProgress.completed} of {jobProgress.total} stages complete
            </p>
          </div>
          <p className="font-mono text-2xl font-semibold text-cyan">
            {jobProgress.percent}%
          </p>
        </div>
        <div className="h-1.5 bg-[#070b11]">
          <div
            className={cn(
              "h-full transition-all duration-700 ease-out",
              job.dossierId ? "bg-gold" : "bg-cyan",
            )}
            style={{ width: `${jobProgress.percent}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-6">
          {deliveryStages.map((stage) => {
            const Icon =
              stageIcons[stage.id as keyof typeof stageIcons] || Circle;
            return (
              <div
                className={cn(
                  "rounded-lg border p-3 transition-all duration-300",
                  visualFor(stage),
                )}
                key={stage.id}
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-4" />
                  {stage.status === "completed" && (
                    <Check className="size-3.5" />
                  )}
                  {stage.status === "active" && (
                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                  )}
                </div>
                <p className="mt-3 text-[11px] font-semibold">{stage.name}</p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-wider opacity-60">
                  {stage.status}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {active && (
        <section
          aria-live="polite"
          className={cn(
            "stage-enter relative mt-5 overflow-hidden rounded-xl border p-5 sm:p-6",
            visualFor(active),
          )}
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-current" />
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={toneFor(active)}>
                  {active.id === "accepted"
                    ? "Ready for dossier"
                    : "Active now"}
                </Badge>
                <span className="font-mono text-[9px] uppercase tracking-widest opacity-60">
                  Stage{" "}
                  {deliveryStages.findIndex((stage) => stage.id === active.id) +
                    1}{" "}
                  of 6
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-white">
                {active.name}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {active.expectedOutput}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-current/15 bg-black/10 p-3">
              <div className="grid size-9 place-items-center rounded-lg border border-current/20 bg-black/15">
                <UserRound className="size-4" />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider opacity-60">
                  Assigned agent
                </p>
                <p className="mt-1 text-xs font-semibold text-white">
                  {activeAgent?.name || "Uzoma Lead"}
                </p>
                <p className="text-[10px] opacity-60">
                  {activeAgent?.role || "Delivery coordinator"}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mt-7 grid gap-7 xl:grid-cols-[1fr_350px]">
        <div className="min-w-0 space-y-7">
          <section className="surface p-6">
            <p className="eyebrow">Build brief</p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              {job.request}
            </p>
          </section>
          <section className="surface overflow-hidden">
            <div className="border-b border-line px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">
                  Lead agent orchestration
                </h2>
                <Badge tone="cyan">Decision log</Badge>
              </div>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
                Escrow delivery requires explicit authority rules, timeout
                protection, adversarial testing, and independent evidence review
                before acceptance.
              </p>
            </div>
            <div className="grid gap-px bg-line sm:grid-cols-2">
              {[
                "Workflow selected: milestone escrow delivery",
                "Planning assigned to Atlas: requirements and acceptance criteria",
                "Implementation assigned to Forge: Odra-style contract artifact",
                "Validation split between Sentinel and Verity for independent testing and acceptance review",
              ].map((decision, index) => (
                <div
                  className="flex gap-3 bg-panel px-5 py-4 sm:px-6"
                  key={decision}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-cyan/20 bg-cyan/5 font-mono text-[9px] text-cyan">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-xs leading-5 text-slate-300">{decision}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Specialist delivery stages
              </h2>
              <span className="font-mono text-[9px] text-slate-600">
                EVIDENCE PIPELINE
              </span>
            </div>
            <div className="space-y-3">
              {job.stages
                .filter((stage) =>
                  ["planning", "building", "testing", "reviewing"].includes(
                    stage.id,
                  ),
                )
                .map((stage) => {
                  const agent = agents.find(
                    (item) => item.id === stage.agentId,
                  );
                  const Icon = stageIcons[stage.id as keyof typeof stageIcons];
                  return (
                    <article
                      className={cn(
                        "stage-enter surface relative overflow-hidden p-5 transition-all duration-300",
                        visualFor(stage),
                        stage.status === "active" && "ring-1 ring-cyan/20",
                      )}
                      key={stage.id}
                    >
                      {stage.status === "active" && (
                        <div className="absolute inset-y-0 left-0 w-1 bg-cyan" />
                      )}
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                        <div
                          className={cn(
                            "grid size-11 shrink-0 place-items-center rounded-lg border",
                            visualFor(stage),
                          )}
                        >
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-white">
                              {stage.name}
                            </h3>
                            <Badge tone={toneFor(stage)}>{stage.status}</Badge>
                            <Badge tone={stage.artifact ? "green" : "slate"}>
                              {stage.artifact
                                ? "Artifact delivered"
                                : "Awaiting output"}
                            </Badge>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border border-line/80 bg-black/10 p-3">
                              <p className="eyebrow">Assigned agent</p>
                              <p className="mt-2 text-xs font-semibold text-slate-200">
                                {agent?.name}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-600">
                                {agent?.role}
                              </p>
                            </div>
                            <div className="rounded-lg border border-line/80 bg-black/10 p-3">
                              <p className="eyebrow">Expected output</p>
                              <p className="mt-2 text-xs leading-5 text-slate-300">
                                {stage.expectedOutput}
                              </p>
                            </div>
                            <div className="rounded-lg border border-line/80 bg-black/10 p-3">
                              <p className="eyebrow">Acceptance checks</p>
                              <div className="mt-2 space-y-1.5">
                                {stage.acceptanceCriteria.map((criterion) => (
                                  <p
                                    className="flex gap-1.5 text-[10px] leading-4 text-slate-400"
                                    key={criterion}
                                  >
                                    <Check className="mt-0.5 size-3 shrink-0 text-slate-600" />
                                    {criterion}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                          {stage.artifact && (
                            <div className="mt-5">
                              <div className="flex flex-wrap items-center gap-2">
                                <FileCheck2 className="size-4 text-emerald" />
                                <p className="text-xs font-semibold text-slate-200">
                                  {stage.artifact.name}
                                </p>
                                <span className="ml-auto font-mono text-[9px] text-slate-600">
                                  {shortHash(stage.artifact.hash)}
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-slate-500">
                                {stage.artifact.summary}
                              </p>
                              <ArtifactPreview artifact={stage.artifact} />
                              <div className="mt-2 flex justify-end">
                                <CopyButton
                                  value={stage.artifact.content}
                                  label="Copy artifact"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        </div>
        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="surface p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Acceptance criteria</p>
              <span className="font-mono text-[9px] text-slate-600">
                {job.criteria.filter((criterion) => criterion.met).length}/
                {job.criteria.length}
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {job.criteria.map((criterion) => (
                <div className="flex gap-3" key={criterion.id}>
                  {criterion.met ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-slate-700" />
                  )}
                  <p className="text-xs leading-5 text-slate-400">
                    {criterion.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
          {derivedStatus === "accepted" ? (
            <section className="surface border-gold/25 bg-gold/[.025] p-5 shadow-[0_0_28px_rgba(241,190,72,.05)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-white">
                  Dossier status
                </p>
                <Badge tone="gold">Verified</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  `${artifacts.length} delivery artifacts recorded`,
                  "Acceptance evidence compiled",
                  "Build dossier created",
                ].map((item) => (
                  <p
                    className="flex items-center gap-2.5 text-xs text-slate-300"
                    key={item}
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-emerald" />
                    {item}
                  </p>
                ))}
              </div>
            </section>
          ) : (
            <section className="surface p-5">
              <div className="flex items-center gap-2">
                <LockKeyhole className="size-4 text-gold" />
                <p className="text-xs font-semibold">Dossier gate</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Available after independent review and acceptance.{" "}
                <span className="text-slate-300">{artifacts.length} of 4</span>{" "}
                delivery artifacts recorded.
              </p>
            </section>
          )}
          {casperProof && job.dossierId && (
            <Link
              href={`/dossier/${job.dossierId}`}
              className="group flex items-center gap-3 rounded-xl border border-gold/25 bg-gold/[.035] p-4 transition hover:border-gold/40 hover:bg-gold/[.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-gold/25 bg-gold/[.08]">
                <RadioTower className="size-4 text-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gold">
                  Casper Testnet proof
                </p>
                <p className="mt-1 text-xs font-semibold text-white">
                  Dossier anchored
                </p>
              </div>
              <Badge className="ml-auto" tone="green">
                Verified
              </Badge>
            </Link>
          )}
          <section className="surface p-5">
            <p className="eyebrow">Current action</p>
            <div className="mt-4 flex items-center gap-3">
              <Clock3
                className={cn("size-4", canDossier ? "text-gold" : "text-cyan")}
              />
              <div>
                <p className="text-xs font-medium text-slate-300">
                  {active?.name || "Workflow complete"}
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  {active?.expectedOutput || "All evidence compiled"}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
