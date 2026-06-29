"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { artifactFor, seedState } from "@/lib/mock-data";
import { demoCasperProof } from "@/lib/casper/proof";
import { applyDossierIntegrity } from "@/lib/dossiers/evidence-integrity";
import {
  createPlannedJob,
  type PlannedJobInput,
} from "@/lib/jobs/create-planned-job";
import type {
  ActivityEvent,
  AgentId,
  AppState,
  BuildDossier,
} from "@/lib/types";

const KEY = "uzoma-demo-state-v2";
type StateContext = {
  state: AppState;
  hydrated: boolean;
  reset: () => void;
  createJob: (input: PlannedJobInput) => string;
  runNextStage: (jobId: string) => void;
  createDossier: (jobId: string) => Promise<string | undefined>;
};
const Context = createContext<StateContext | null>(null);

function normalizeSeedAnchorEvent(event: ActivityEvent): ActivityEvent {
  if (event.id !== "evt-seed-dossier") return event;
  return {
    ...event,
    title: "Build Dossier anchored on Casper Testnet",
    description:
      "Milestone Escrow Contract accepted and anchored in the Casper Testnet Build Dossier Registry.",
    timestamp: demoCasperProof.onChainRecord.recordedAtIso,
  };
}

function normalizeAgentId(id: unknown): AgentId {
  return id === "atlas" ? "axiom" : (id as AgentId);
}

function normalizeSpecialistName(name: unknown) {
  return name === "Atlas" ? "Axiom" : name;
}

function normalizeStoredState(value: AppState): AppState {
  return {
    ...value,
    jobs: value.jobs.map((job) => ({
      ...job,
      agentMode: job.agentMode ?? "deterministic_demo",
      leadAgentPlan: job.leadAgentPlan
        ? {
            ...job.leadAgentPlan,
            specialist_assignments:
              job.leadAgentPlan.specialist_assignments.map((assignment) => ({
                ...assignment,
                specialist: normalizeSpecialistName(
                  assignment.specialist,
                ) as typeof assignment.specialist,
              })),
          }
        : undefined,
      stages: job.stages.map((stage) => ({
        ...stage,
        agentId: normalizeAgentId(stage.agentId),
        artifact: stage.artifact
          ? {
              ...stage.artifact,
              agentId: normalizeAgentId(stage.artifact.agentId),
            }
          : undefined,
      })),
    })),
    events: value.events.map((event) => ({
      ...normalizeSeedAnchorEvent(event),
      agentId: event.agentId ? normalizeAgentId(event.agentId) : undefined,
    })),
    dossiers: value.dossiers.map((dossier) => ({
      ...dossier,
      localWorkflowStatus: dossier.localWorkflowStatus ?? "accepted",
      casperAnchorStatus:
        dossier.id === "demo-escrow"
          ? "confirmed"
          : (dossier.casperAnchorStatus ?? "not-anchored"),
      artifacts: dossier.artifacts.map((artifact) => ({
        ...artifact,
        agentId: normalizeAgentId(artifact.agentId),
      })),
      timeline: dossier.timeline.map((event) => ({
        ...normalizeSeedAnchorEvent(event),
        agentId: event.agentId ? normalizeAgentId(event.agentId) : undefined,
      })),
    })),
  };
}

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(seedState);
  const [hydrated, setHydrated] = useState(false);
  const updateState = useCallback(
    (updater: (current: AppState) => AppState) => {
      setState((current) => {
        const next = updater(current);
        localStorage.setItem(KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setState(normalizeStoredState(JSON.parse(stored)));
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, hydrated]);
  useEffect(() => {
    const syncState = (event: StorageEvent) => {
      if (event.key !== KEY || !event.newValue) return;
      try {
        setState(normalizeStoredState(JSON.parse(event.newValue)));
      } catch {}
    };
    window.addEventListener("storage", syncState);
    return () => window.removeEventListener("storage", syncState);
  }, []);
  const reset = useCallback(
    () => updateState(() => seedState()),
    [updateState],
  );
  const createJob = useCallback(
    (input: PlannedJobInput) => {
      const id = `${input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32)}-${Date.now().toString(36).slice(-4)}`;
      const now = new Date().toISOString();
      const job = createPlannedJob(input, id, now);
      updateState((s) => ({
        ...s,
        jobs: [job, ...s.jobs],
        events: [
          {
            id: `evt-${Date.now()}`,
            jobId: id,
            type: "job.created",
            title: "Build request created",
            description: `${job.title} entered the delivery workflow.`,
            timestamp: now,
          },
          ...s.events,
        ],
      }));
      return id;
    },
    [updateState],
  );
  const runNextStage = useCallback(
    (jobId: string) =>
      updateState((s) => {
        const job = s.jobs.find((j) => j.id === jobId);
        if (!job) return s;
        const activeIndex = job.stages.findIndex((x) => x.status === "active");
        if (activeIndex < 0 || activeIndex >= job.stages.length - 1) return s;
        const now = new Date().toISOString();
        const active = job.stages[activeIndex];
        const artifact = artifactFor(active.id, jobId, now);
        const stages = job.stages.map((st, i) =>
          i === activeIndex
            ? { ...st, status: "completed" as const, timestamp: now, artifact }
            : i === activeIndex + 1
              ? { ...st, status: "active" as const }
              : st,
        );
        const event = {
          id: `evt-${Date.now()}`,
          jobId,
          type: artifact ? "artifact.submitted" : "stage.completed",
          title: artifact
            ? `${artifact.name} submitted`
            : `${active.name} completed`,
          description:
            artifact?.summary || `${active.name} passed its acceptance checks.`,
          timestamp: now,
          agentId: active.agentId,
        };
        return {
          ...s,
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stages,
                  status: stages[activeIndex + 1].name,
                  criteria:
                    active.id === "reviewing"
                      ? j.criteria.map((criterion) => ({
                          ...criterion,
                          met: true,
                        }))
                      : j.criteria,
                }
              : j,
          ),
          events: [event, ...s.events],
        };
      }),
    [updateState],
  );
  const createDossier = useCallback(
    async (jobId: string) => {
      const currentJob = state.jobs.find((job) => job.id === jobId);
      if (!currentJob || currentJob.dossierId) {
        return currentJob?.dossierId;
      }
      const acceptedIndex = currentJob.stages.findIndex(
        (stage) => stage.id === "accepted",
      );
      if (
        acceptedIndex < 0 ||
        currentJob.stages[acceptedIndex].status !== "active"
      ) {
        return undefined;
      }
      const now = new Date().toISOString();
      const dossierId = currentJob.id;
      const artifacts = currentJob.stages.flatMap((stage) =>
        stage.artifact ? [stage.artifact] : [],
      );
      const event = {
        id: `evt-${Date.now()}`,
        jobId,
        type: "dossier.generated",
        title: "Build Dossier generated",
        description: `${currentJob.title} accepted and recorded in the local dossier registry.`,
        timestamp: now,
        agentId: "uzoma" as const,
      };
      const provisionalDossier: BuildDossier = {
        id: dossierId,
        jobId,
        createdAt: now,
        dossierHash: "",
        finalApproval: "Approved",
        localWorkflowStatus: "accepted",
        casperAnchorStatus: "not-anchored",
        artifacts,
        timeline: [
          ...state.events.filter((event) => event.jobId === jobId),
          event,
        ].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        receipts: artifacts.map((artifact, index) => ({
          id: `x402-demo-${jobId}-${String(index + 1).padStart(3, "0")}`,
          stageId: artifact.id,
          status: "mock",
          amount: agentsQuote(artifact.agentId),
          note: "Mock delivery receipt — no payment executed",
        })),
      };
      const dossier = await applyDossierIntegrity(provisionalDossier);
      updateState((s) => {
        const job = s.jobs.find((j) => j.id === jobId);
        if (!job || job.dossierId) {
          return s;
        }
        const stages = job.stages.map((st) =>
          st.id === "accepted" || st.id === "dossier"
            ? { ...st, status: "completed" as const, timestamp: now }
            : st,
        );
        return {
          jobs: s.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stages,
                  status: "Dossier Created",
                  dossierId,
                  criteria: j.criteria.map((c) => ({ ...c, met: true })),
                }
              : j,
          ),
          dossiers: [dossier, ...s.dossiers],
          events: [event, ...s.events],
        };
      });
      return dossierId;
    },
    [state.events, state.jobs, updateState],
  );
  const value = useMemo(
    () => ({ state, hydrated, reset, createJob, runNextStage, createDossier }),
    [state, hydrated, reset, createJob, runNextStage, createDossier],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
function agentsQuote(id: string) {
  return id === "axiom"
    ? "$18.00"
    : id === "forge"
      ? "$64.00"
      : id === "sentinel"
        ? "$28.00"
        : "$24.00";
}
export function useAppState() {
  const value = useContext(Context);
  if (!value) throw new Error("useAppState must be used within StateProvider");
  return value;
}
