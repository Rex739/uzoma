"use client";

import { Plus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAppState } from "@/components/state-provider";

export function CreateJobDialog() {
  const [open, setOpen] = useState(false);
  const [criteria, setCriteria] = useState(["", "", ""]);
  const { createJob } = useAppState();
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const id = createJob({
      title: String(data.get("title")),
      request: String(data.get("request")),
      contractType: String(data.get("type")),
      priority: String(data.get("priority")) as
        | "Standard"
        | "High"
        | "Critical",
      criteria,
    });
    setOpen(false);
    router.push(`/jobs/${id}`);
  }
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
            onClick={() => setOpen(false)}
            aria-label="Close dialog"
          />
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-panel p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2
                  id="create-title"
                  className="text-lg font-semibold text-white"
                >
                  Create build request
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Define the work and the evidence required for acceptance.
                </p>
              </div>
              <button
                className="rounded-md p-2 text-slate-500 hover:bg-white/5"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <form className="mt-7 space-y-5" onSubmit={submit}>
              <label>
                <span className="label">Project name</span>
                <input
                  name="title"
                  className="input"
                  placeholder="Token vesting contract"
                  required
                />
              </label>
              <label>
                <span className="label">Task description</span>
                <textarea
                  name="request"
                  className="input min-h-24 resize-none"
                  placeholder="Describe the intended contract behavior, participants, and constraints…"
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Contract type</span>
                  <select name="type" className="input" defaultValue="Escrow">
                    <option>Escrow</option>
                    <option>Vesting</option>
                    <option>Registry</option>
                    <option>Custom</option>
                  </select>
                </label>
                <label>
                  <span className="label">Priority</span>
                  <select
                    name="priority"
                    className="input"
                    defaultValue="Standard"
                  >
                    <option>Standard</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                </label>
              </div>
              <fieldset>
                <legend className="label">Acceptance criteria</legend>
                <div className="space-y-2">
                  {criteria.map((value, i) => (
                    <input
                      key={i}
                      className="input"
                      value={value}
                      onChange={(e) =>
                        setCriteria((c) =>
                          c.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                      placeholder={`Criterion ${i + 1}${i === 0 ? " (required)" : ""}`}
                      required={i === 0}
                    />
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  Create and plan <Plus className="size-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
