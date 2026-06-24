"use client";

import { AlertTriangle, ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAppState } from "@/components/state-provider";
import { generateDeterministicPlan } from "@/lib/agent/fallback";
import {
  LeadAgentRequestSchema,
  LiveLeadAgentResponseSchema,
  type LeadAgentRequest,
} from "@/lib/agent/schema";
import type { BuildJob } from "@/lib/types";

type PendingJob = LeadAgentRequest & {
  contractType: string;
  priority: BuildJob["priority"];
};

export function CreateJobDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<string>();
  const [pendingJob, setPendingJob] = useState<PendingJob>();
  const { createJob } = useAppState();
  const router = useRouter();

  function closeDialog() {
    if (loading) return;
    setOpen(false);
    setError(undefined);
    setErrorCode(undefined);
    setPendingJob(undefined);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) {
        setOpen(false);
        setError(undefined);
        setErrorCode(undefined);
        setPendingJob(undefined);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, loading]);

  function finish(
    job: PendingJob,
    plan: Parameters<typeof createJob>[0]["leadAgentPlan"],
    agentMode: "live" | "deterministic_demo",
  ) {
    const id = createJob({
      title: job.title,
      request: job.description,
      deliveryContext: job.context,
      contractType: job.contractType,
      priority: job.priority,
      agentMode,
      leadAgentPlan: plan,
    });
    setOpen(false);
    setError(undefined);
    setErrorCode(undefined);
    setPendingJob(undefined);
    router.push(`/jobs/${id}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setErrorCode(undefined);
    const data = new FormData(event.currentTarget);
    const request = LeadAgentRequestSchema.safeParse({
      title: String(data.get("title")),
      description: String(data.get("description")),
      context: String(data.get("context")),
    });
    if (!request.success) {
      setError("Add a clear title, description, and delivery context.");
      return;
    }

    const job: PendingJob = {
      ...request.data,
      contractType: String(data.get("type")),
      priority: String(data.get("priority")) as BuildJob["priority"],
    };
    setPendingJob(job);
    setLoading(true);
    try {
      const response = await fetch("/api/lead-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.data),
      });
      const payload: unknown = await response.json().catch(() => null);
      const live = LiveLeadAgentResponseSchema.safeParse(payload);
      if (!response.ok || !live.success) {
        const code =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          payload.error &&
          typeof payload.error === "object" &&
          "code" in payload.error &&
          typeof payload.error.code === "string"
            ? payload.error.code
            : undefined;
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          payload.error &&
          typeof payload.error === "object" &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "Live planning could not complete.";
        setErrorCode(code);
        setError(message);
        return;
      }
      finish(job, live.data.plan, "live");
    } catch {
      setErrorCode("OPENAI_PROVIDER_UNAVAILABLE");
      setError(
        "Live planning could not be reached. Retry, or explicitly use the deterministic demo planner.",
      );
    } finally {
      setLoading(false);
    }
  }

  function useDeterministicPlan() {
    if (!pendingJob) return;
    const plan = generateDeterministicPlan(pendingJob);
    finish(pendingJob, plan, "deterministic_demo");
  }

  const errorTitle =
    errorCode === "OPENAI_INSUFFICIENT_QUOTA"
      ? "API credits required"
      : errorCode === "OPENAI_INVALID_API_KEY"
        ? "API key rejected"
        : errorCode === "OPENAI_MODEL_NOT_AVAILABLE"
          ? "Configured model unavailable"
          : errorCode === "OPENAI_MODEL_NOT_SUPPORTED"
            ? "Configured model not supported"
            : errorCode === "OPENAI_RATE_LIMITED"
              ? "Provider rate limit reached"
              : errorCode === "OPENAI_STRUCTURED_OUTPUT_INVALID"
                ? "Delivery-plan format rejected"
                : errorCode === "OPENAI_NOT_CONFIGURED"
                  ? "Live planning not configured"
                  : errorCode === "OPENAI_PROVIDER_UNAVAILABLE"
                    ? "Live planning provider unavailable"
                    : "Live delivery planning unavailable";

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create Build Request
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-title"
        >
          <button
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={closeDialog}
            aria-label="Close dialog"
          />
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-panel p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-5">
              <div>
                <h2
                  id="create-title"
                  className="text-lg font-semibold text-white"
                >
                  Create build request
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Generate a bounded specialist delivery plan from your brief.
                </p>
              </div>
              <button
                className="rounded-md p-2 text-slate-500 hover:bg-white/5 disabled:opacity-50"
                onClick={closeDialog}
                aria-label="Close"
                disabled={loading}
              >
                <X className="size-4" />
              </button>
            </div>
            <form className="mt-7 space-y-6" onSubmit={submit}>
              <label className="block">
                <span className="label">Project title</span>
                <input
                  name="title"
                  className="input"
                  placeholder="Token vesting contract"
                  minLength={3}
                  maxLength={120}
                  required
                />
              </label>
              <label className="block">
                <span className="label">Task description</span>
                <textarea
                  name="description"
                  className="input min-h-24 resize-none"
                  placeholder="Describe the intended contract behavior, participants, and constraints…"
                  minLength={20}
                  maxLength={3000}
                  required
                />
              </label>
              <label className="block">
                <span className="label">Delivery context</span>
                <textarea
                  name="context"
                  className="input min-h-20 resize-none"
                  placeholder="Describe the business context, assets, review concerns, or operating assumptions…"
                  minLength={3}
                  maxLength={2000}
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Contract type</span>
                  <span className="relative block">
                    <select
                      name="type"
                      className="input h-10 appearance-none pr-10"
                      defaultValue="Escrow"
                    >
                      <option>Escrow</option>
                      <option>Vesting</option>
                      <option>Registry</option>
                      <option>Custom</option>
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-600"
                    />
                  </span>
                </label>
                <label className="block">
                  <span className="label">Priority</span>
                  <span className="relative block">
                    <select
                      name="priority"
                      className="input h-10 appearance-none pr-10"
                      defaultValue="Standard"
                    >
                      <option>Standard</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-600"
                    />
                  </span>
                </label>
              </div>

              {error && (
                <div
                  className="rounded-lg border border-red-400/20 bg-red-400/5 p-4"
                  role="alert"
                >
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-300" />
                    <div>
                      <p className="text-xs font-semibold text-red-100">
                        {errorTitle}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-red-200/65">
                        {error}
                      </p>
                    </div>
                  </div>
                  {pendingJob && (
                    <Button
                      className="mt-4"
                      type="button"
                      variant="ghost"
                      onClick={useDeterministicPlan}
                    >
                      Use deterministic demo plan
                    </Button>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeDialog}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={loading} disabled={loading}>
                  {loading
                    ? "Generating delivery plan…"
                    : "Generate delivery plan"}
                  <Sparkles className="size-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
