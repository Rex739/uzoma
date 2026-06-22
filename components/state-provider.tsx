"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { artifactFor, createStages, seedState } from "@/lib/mock-data";
import type { AppState, BuildDossier, BuildJob } from "@/lib/types";

const KEY = "uzoma-demo-state-v1";
type StateContext = {
  state: AppState;
  hydrated: boolean;
  reset: () => void;
  createJob: (input: {
    title: string;
    request: string;
    contractType: string;
    priority: BuildJob["priority"];
    criteria: string[];
  }) => string;
  runNextStage: (jobId: string) => void;
  createDossier: (jobId: string) => string | undefined;
};
const Context = createContext<StateContext | null>(null);

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(seedState);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setState(JSON.parse(stored));
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
        setState(JSON.parse(event.newValue));
      } catch {}
    };
    window.addEventListener("storage", syncState);
    return () => window.removeEventListener("storage", syncState);
  }, []);
  const reset = useCallback(() => setState(seedState()), []);
  const createJob = useCallback(
    (input: {
      title: string;
      request: string;
      contractType: string;
      priority: BuildJob["priority"];
      criteria: string[];
    }) => {
      const id = `${input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32)}-${Date.now().toString(36).slice(-4)}`;
      const now = new Date().toISOString();
      const job: BuildJob = {
        id,
        title: input.title,
        request: input.request,
        contractType: input.contractType,
        priority: input.priority,
        status: "Planning",
        createdAt: now,
        criteria: input.criteria
          .filter(Boolean)
          .map((text, i) => ({ id: `${id}-criterion-${i}`, text, met: false })),
        stages: createStages(1),
      };
      setState((s) => ({
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
    [],
  );
  const runNextStage = useCallback(
    (jobId: string) =>
      setState((s) => {
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
    [],
  );
  const createDossier = useCallback((jobId: string) => {
    let dossierId: string | undefined;
    setState((s) => {
      const job = s.jobs.find((j) => j.id === jobId);
      if (!job || job.dossierId) {
        dossierId = job?.dossierId;
        return s;
      }
      const acceptedIndex = job.stages.findIndex((st) => st.id === "accepted");
      if (acceptedIndex < 0 || job.stages[acceptedIndex].status !== "active")
        return s;
      const now = new Date().toISOString();
      dossierId = job.id;
      const artifacts = job.stages.flatMap((st) =>
        st.artifact ? [st.artifact] : [],
      );
      const event = {
        id: `evt-${Date.now()}`,
        jobId,
        type: "dossier.generated",
        title: "Build Dossier generated",
        description:
          "Artifact hashes, delivery receipts, and approval evidence were compiled.",
        timestamp: now,
        agentId: "uzoma" as const,
      };
      const dossier: BuildDossier = {
        id: dossierId,
        jobId,
        createdAt: now,
        dossierHash: `sha256:${`uzoma-dossier-${jobId}`.padEnd(64, "4fd18b").slice(0, 64)}`,
        finalApproval: "Approved",
        proofStatus: "Integration Architecture — Not Yet Anchored",
        artifacts,
        timeline: [...s.events.filter((e) => e.jobId === jobId), event].sort(
          (a, b) => a.timestamp.localeCompare(b.timestamp),
        ),
        receipts: artifacts.map((a, i) => ({
          id: `x402-demo-${jobId}-${String(i + 1).padStart(3, "0")}`,
          stageId: a.id,
          status: "mock",
          amount: agentsQuote(a.agentId),
          note: "Mock delivery receipt — no payment executed",
        })),
      };
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
  }, []);
  const value = useMemo(
    () => ({ state, hydrated, reset, createJob, runNextStage, createDossier }),
    [state, hydrated, reset, createJob, runNextStage, createDossier],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
function agentsQuote(id: string) {
  return id === "atlas"
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
