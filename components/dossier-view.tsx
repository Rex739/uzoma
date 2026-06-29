"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { DossierAnchorAction } from "@/components/dossier-anchor-action";
import { useAppState } from "@/components/state-provider";
import { Badge, Button, CopyButton, EmptyState } from "@/components/ui";
import { getCasperProofForJob } from "@/lib/casper/proof";
import { agents, artifactFor, criteria, defaultJob } from "@/lib/mock-data";
import type { BuildDossier } from "@/lib/types";
import { formatTime, shortHash } from "@/lib/utils";

function ProofRow({
  label,
  value,
  display,
}: {
  label: string;
  value: string;
  display?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-t border-gold/10 py-3 first:border-0 first:pt-0">
      <p className="shrink-0 text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </p>
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-[10px] text-slate-300">
          {display ?? shortHash(value)}
        </span>
        <CopyButton value={value} label="Copy" />
      </div>
    </div>
  );
}

function previewDossier(): BuildDossier {
  const at = "2026-06-20T10:21:00.000Z";
  const artifacts = ["planning", "building", "testing", "reviewing"].flatMap(
    (id) => {
      const a = artifactFor(id, "demo-escrow", at);
      return a ? [a] : [];
    },
  );
  return {
    id: "demo-escrow",
    jobId: "demo-escrow",
    createdAt: at,
    dossierHash:
      "sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd",
    finalApproval: "Approved",
    localWorkflowStatus: "accepted",
    casperAnchorStatus: "confirmed",
    artifacts,
    timeline: [
      {
        id: "p1",
        jobId: "demo-escrow",
        type: "job.created",
        title: "Build request created",
        description: "Milestone Escrow Contract entered the workflow.",
        timestamp: "2026-06-20T09:14:00.000Z",
      },
      {
        id: "p2",
        jobId: "demo-escrow",
        type: "artifact.submitted",
        title: "Specification accepted",
        description: "Axiom delivered the contract requirements.",
        timestamp: "2026-06-20T09:28:00.000Z",
        agentId: "axiom",
      },
      {
        id: "p3",
        jobId: "demo-escrow",
        type: "artifact.submitted",
        title: "Implementation submitted",
        description: "Forge delivered an Odra-style implementation artifact.",
        timestamp: "2026-06-20T09:46:00.000Z",
        agentId: "forge",
      },
      {
        id: "p4",
        jobId: "demo-escrow",
        type: "test.passed",
        title: "Test suite passed",
        description: "8 tests passed with 94% reported coverage.",
        timestamp: "2026-06-20T10:02:00.000Z",
        agentId: "sentinel",
      },
      {
        id: "p5",
        jobId: "demo-escrow",
        type: "review.approved",
        title: "Independent review approved",
        description: "Verity confirmed every acceptance criterion.",
        timestamp: "2026-06-20T10:15:00.000Z",
        agentId: "verity",
      },
      {
        id: "p6",
        jobId: "demo-escrow",
        type: "dossier.generated",
        title: "Build Dossier generated",
        description: "Evidence compiled into a deterministic local dossier.",
        timestamp: at,
      },
    ],
    receipts: artifacts.map((a, i) => ({
      id: `x402-demo-escrow-00${i + 1}`,
      stageId: a.id,
      status: "mock",
      amount: ["$18.00", "$64.00", "$28.00", "$24.00"][i],
      note: "Mock delivery receipt — no payment executed",
    })),
  };
}
export function DossierView({ id }: { id: string }) {
  const { state, hydrated } = useAppState();
  if (!hydrated) return <div className="surface h-96 animate-pulse" />;
  const dossier =
    state.dossiers.find((d) => d.id === id) ||
    (id === "demo-escrow" ? previewDossier() : undefined);
  const job =
    state.jobs.find((j) => j.id === dossier?.jobId) ||
    (id === "demo-escrow" ? defaultJob : undefined);
  if (!dossier || !job)
    return (
      <EmptyState
        title="Dossier not found"
        description="Complete a job workflow to create its Build Dossier."
      />
    );
  const casperProof =
    dossier.casperAnchorStatus === "confirmed"
      ? getCasperProofForJob(job.id)
      : undefined;
  const liveProof = dossier.casperAnchorProof;
  const exportJson = JSON.stringify(
    {
      schema: "uzoma.build-dossier.v1",
      ...dossier,
      job: {
        ...job,
        criteria: job.criteria.length ? job.criteria : criteria,
      },
      casperProof,
    },
    null,
    2,
  );
  const exportHref = `data:application/json;charset=utf-8,${encodeURIComponent(exportJson)}`;
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-white"
        >
          <ArrowLeft className="size-3" />
          Back to job
        </Link>
        <Button variant="secondary" asChild>
          <a
            href={exportHref}
            download={`uzoma-dossier-${dossier.id}.json`}
            aria-label="Download dossier JSON"
          >
            <Download className="size-4" />
            Download JSON
          </a>
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gold/20 bg-panel">
        <div className="grid-bg relative border-b border-line p-6 sm:p-9">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,185,73,.08),transparent_38%)]" />
          <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-3">
                <Badge tone="gold">Verified delivery</Badge>
                {(casperProof || liveProof) && (
                  <Badge tone="green">Testnet anchored</Badge>
                )}
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">
                {job.title}
              </h1>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                Build Dossier · {dossier.id}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-full border border-gold/30 bg-gold/10">
                <ShieldCheck className="size-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Final approval</p>
                <p className="mt-1 text-sm font-semibold text-gold">
                  {dossier.finalApproval}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-line md:grid-cols-3">
          <div className="bg-panel p-5">
            <p className="eyebrow">Job ID</p>
            <p className="mt-3 font-mono text-xs text-slate-300">{job.id}</p>
          </div>
          <div className="bg-panel p-5">
            <p className="eyebrow">Created</p>
            <p className="mt-3 text-xs text-slate-300">
              {formatTime(dossier.createdAt)}
            </p>
          </div>
          <div className="bg-panel p-5">
            <p className="eyebrow">Evidence set</p>
            <p className="mt-3 text-xs text-slate-300">
              {dossier.artifacts.length} artifacts · {dossier.receipts.length}{" "}
              receipts
            </p>
          </div>
        </div>
      </div>
      <div className="mt-7 grid gap-7 xl:grid-cols-[1fr_370px]">
        <div className="min-w-0 space-y-7">
          <section className="relative overflow-hidden rounded-xl border border-gold/25 bg-[linear-gradient(135deg,rgba(233,185,73,.09),rgba(35,213,245,.035))] p-6 sm:p-7">
            <div className="absolute right-0 top-0 size-40 rounded-full bg-gold/[.04] blur-3xl" />
            <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Fingerprint className="size-4 text-gold" />
                  <p className="eyebrow text-gold">
                    Deterministic dossier hash
                  </p>
                </div>
                <p className="mt-4 break-all font-mono text-sm font-semibold leading-7 text-white sm:text-base">
                  {dossier.dossierHash}
                </p>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">
                  Stable local reference binding the accepted brief, evidence,
                  artifact hashes, and final approval.
                </p>
              </div>
              <CopyButton value={dossier.dossierHash} label="Copy hash" />
            </div>
          </section>
          <section
            className={`rounded-xl border px-5 py-4 ${
              casperProof || liveProof
                ? "border-gold/20 bg-gold/[.035]"
                : "border-cyan/15 bg-cyan/[.025]"
            }`}
          >
            <p
              className={`eyebrow ${
                casperProof || liveProof ? "text-gold" : "text-cyan"
              }`}
            >
              Dossier integrity
            </p>
            <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200">
              {casperProof || liveProof
                ? "4 ACCEPTED ARTIFACTS · INDEPENDENT REVIEW COMPLETE · TESTNET ANCHOR CONFIRMED"
                : "4 ACCEPTED ARTIFACTS · INDEPENDENT REVIEW COMPLETE · LOCAL DOSSIER VERIFIED"}
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              {casperProof || liveProof
                ? "This accepted delivery record is bound to the verified artifact manifest below and has a confirmed Casper Testnet anchor."
                : "The manifest below binds the approved specification, implementation artifact, test evidence, and independent review into one accepted delivery record."}
            </p>
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Artifact manifest</h2>
              <span className="font-mono text-[9px] text-slate-600">
                SHA-256 REFERENCES
              </span>
            </div>
            <div className="surface divide-y divide-line">
              {dossier.artifacts.map((a, i) => (
                <div className="p-5" key={a.id}>
                  <div className="flex items-start gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-emerald/20 bg-emerald/5">
                      <FileCheck2 className="size-4 text-emerald" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-slate-200">
                          {a.name}
                        </p>
                        <Badge tone="green">
                          {agents.find((x) => x.id === a.agentId)?.name}
                        </Badge>
                        <Badge tone="gold">Accepted</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {a.summary}
                      </p>
                      <p className="mt-3 break-all font-mono text-[9px] text-slate-700">
                        {a.hash}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-slate-700">
                      0{i + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-4 text-sm font-semibold">Status timeline</h2>
            <div className="surface p-5">
              {dossier.timeline.map((e, i) => (
                <div className="flex gap-4" key={e.id}>
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 size-2 rounded-full ${i === dossier.timeline.length - 1 ? "bg-gold" : "bg-emerald"}`}
                    />
                    {i < dossier.timeline.length - 1 && (
                      <span className="min-h-14 w-px flex-1 bg-line" />
                    )}
                  </div>
                  <div className="pb-6">
                    <p className="text-xs font-medium">{e.title}</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-600">
                      {e.description}
                    </p>
                    <p className="mt-2 font-mono text-[9px] text-slate-700">
                      {formatTime(e.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          <section className="surface p-5">
            <p className="eyebrow">Acceptance evidence</p>
            <div className="mt-4 space-y-3">
              {(job.criteria.length
                ? job.criteria
                : criteria.map((text, i) => ({
                    id: String(i),
                    text,
                    met: true,
                  }))
              ).map((c) => (
                <div className="flex gap-2.5" key={c.id}>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald" />
                  <p className="text-xs leading-5 text-slate-400">{c.text}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="surface p-5">
            <div className="flex items-center gap-2">
              <Layers3 className="size-4 text-slate-500" />
              <p className="text-xs font-semibold">Delivery receipts</p>
            </div>
            <div className="mt-4 space-y-3">
              {dossier.receipts.map((r) => (
                <div
                  className="rounded-lg border border-line bg-[#080d14] p-3"
                  key={r.id}
                >
                  <div className="flex justify-between">
                    <p className="font-mono text-[9px] text-slate-500">
                      {r.id}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {r.amount}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-700">{r.note}</p>
                </div>
              ))}
            </div>
          </section>
          {casperProof ? (
            <section className="rounded-xl border border-gold/30 bg-[linear-gradient(145deg,rgba(233,185,73,.09),rgba(20,184,166,.035))] p-5 shadow-[0_0_32px_rgba(233,185,73,.05)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-gold" />
                  <p className="text-xs font-semibold text-white">
                    Casper Testnet Anchor
                  </p>
                </div>
                <Badge tone="green">Confirmed</Badge>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-400">
                Anchored on Casper Testnet. Confirmed on-chain proof in the live
                Testnet registry.
              </p>
              <div className="mt-4">
                <ProofRow
                  label="Network"
                  value={casperProof.network}
                  display={casperProof.network}
                />
                <ProofRow
                  label="Registry"
                  value={casperProof.registry}
                  display={casperProof.registry}
                />
                <ProofRow
                  label="Package hash"
                  value={casperProof.packageHash}
                />
                <ProofRow
                  label="Anchor transaction"
                  value={casperProof.anchorTransactionHash}
                />
                <ProofRow
                  label="Install transaction"
                  value={casperProof.installTransactionHash}
                />
                <ProofRow
                  label="Dossier hash"
                  value={casperProof.onChainRecord.dossierHash}
                />
                <ProofRow
                  label="Artifact root"
                  value={casperProof.onChainRecord.artifactRootHash}
                />
                <ProofRow
                  label="On-chain status"
                  value="Accepted"
                  display="Accepted"
                />
                <ProofRow
                  label="Anchored"
                  value={String(casperProof.block.height)}
                  display="Jun 23, 11:43 AM · Block 8,274,002"
                />
              </div>
            </section>
          ) : liveProof ? (
            <section className="rounded-xl border border-gold/30 bg-[linear-gradient(145deg,rgba(233,185,73,.09),rgba(20,184,166,.035))] p-5 shadow-[0_0_32px_rgba(233,185,73,.05)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-gold" />
                  <p className="text-xs font-semibold text-white">
                    Casper Testnet Anchor
                  </p>
                </div>
                <Badge tone="green">Confirmed</Badge>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-400">
                Confirmed on-chain proof in the live Testnet registry. This
                proof is saved in this browser until public persistence is
                added.
              </p>
              <div className="mt-4">
                <ProofRow
                  label="Network"
                  value={liveProof.network}
                  display={liveProof.network}
                />
                <ProofRow
                  label="Package hash"
                  value={liveProof.packageHash}
                />
                <ProofRow
                  label="Anchor transaction"
                  value={liveProof.anchorTransactionHash}
                />
                <ProofRow
                  label="Dossier hash"
                  value={liveProof.onChainRecord.dossierHash}
                />
                <ProofRow
                  label="Artifact root"
                  value={liveProof.onChainRecord.artifactRootHash}
                />
                <ProofRow
                  label="On-chain status"
                  value="Accepted"
                  display="Accepted"
                />
              </div>
              <a
                href={liveProof.csprLiveUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-xs text-cyan hover:text-white"
              >
                View on CSPR.live <ExternalLink className="size-3" />
              </a>
            </section>
          ) : (
            <>
              <DossierAnchorAction dossier={dossier} job={job} />
              <section className="rounded-xl border border-line bg-white/[.015] p-5">
                <p className="text-xs font-semibold text-slate-300">
                  Casper anchor not recorded
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  This local dossier has not been anchored automatically.
                </p>
              </section>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
