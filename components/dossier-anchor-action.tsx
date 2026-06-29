"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import {
  isLegacyDossier,
  isValidMotesPaymentAmount,
  type LiveProofAnchorState,
} from "@/lib/casper/live-proof";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-transaction";
import { getCsprClickConfigIssue } from "@/lib/casper/csprclick-client";
import {
  computeDossierIntegrity,
  getDossierAnchorEligibility,
  type DossierAnchorEligibility,
} from "@/lib/dossiers/evidence-integrity";
import type { BuildDossier, BuildJob } from "@/lib/types";
import { shortHash } from "@/lib/utils";

type Props = {
  dossier: BuildDossier;
  job: BuildJob;
};

function ProofField({
  label,
  value,
  display,
}: {
  label: string;
  value: string;
  display?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-t border-line py-2 first:border-0">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </span>
      <span className="min-w-0 truncate font-mono text-[10px] text-slate-300">
        {display ?? value}
      </span>
    </div>
  );
}

export function DossierAnchorAction({ dossier, job }: Props) {
  const [eligibility, setEligibility] =
    useState<DossierAnchorEligibility | null>(null);
  const [state, setState] = useState<LiveProofAnchorState>("ready");
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [message, setMessage] = useState("");

  const artifactRootHash = dossier.artifactRootHash ?? "";
  const configIssue = getCsprClickConfigIssue();
  const isLegacy = isLegacyDossier(dossier);
  const paymentIsValid = isValidMotesPaymentAmount(paymentAmount);

  useEffect(() => {
    let active = true;
    void getDossierAnchorEligibility(dossier).then((result) => {
      if (active) setEligibility(result);
    });
    return () => {
      active = false;
    };
  }, [dossier]);

  const readinessMessages = useMemo(() => {
    if (configIssue) return [configIssue];
    if (!eligibility) return ["Checking deterministic evidence integrity…"];
    return eligibility.messages;
  }, [configIssue, eligibility]);

  if (isLegacy || dossier.casperAnchorStatus === "confirmed") {
    return null;
  }

  if (!eligibility?.eligible || configIssue) {
    return (
      <section className="rounded-xl border border-line bg-white/[.015] p-5">
        <p className="text-xs font-semibold text-slate-300">
          Live proof readiness
        </p>
        <div className="mt-3 space-y-2">
          {readinessMessages.map((item) => (
            <p className="text-xs leading-5 text-slate-600" key={item}>
              {item}
            </p>
          ))}
        </div>
      </section>
    );
  }

  async function reviewInWallet() {
    if (!paymentIsValid) {
      setMessage("Enter a deliberate positive payment amount in motes.");
      return;
    }
    setState("reviewing");
    setMessage("");
    try {
      const integrity = await computeDossierIntegrity(dossier);
      if (
        integrity.dossierHash !== dossier.dossierHash ||
        integrity.artifactRootHash !== artifactRootHash
      ) {
        setState("failed");
        setMessage(
          "Evidence changed after acceptance. Re-accept the dossier before anchoring.",
        );
        return;
      }
      setMessage(
        "Payload readiness passed. Wallet submission is disabled during Phase 2C; use internal diagnostics for connection-only smoke testing.",
      );
    } catch {
      setState("failed");
      setMessage(
        "Evidence changed after acceptance. Re-accept the dossier before anchoring.",
      );
    }
  }

  return (
    <>
      <section className="rounded-xl border border-cyan/20 bg-cyan/[.025] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-200">
              Anchor accepted dossier
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Casper Testnet · Explicit user action
            </p>
          </div>
          <Badge tone="cyan">Ready</Badge>
        </div>
        <Button
          className="mt-4 w-full"
          variant="secondary"
          onClick={() => {
            setModalOpen(true);
            setState("reviewing");
          }}
        >
          <ShieldCheck className="size-4" />
          Anchor accepted dossier
        </Button>
      </section>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Review Casper Testnet anchor payload"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-cyan">Live proof mode</p>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  Review Casper Testnet anchor
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  This creates a real Casper Testnet transaction. Uzoma never
                  signs or submits on your behalf.
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-white"
                onClick={() => setModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 rounded-xl border border-line bg-[#080d14] p-4">
              <ProofField label="Job ID" value={job.id} />
              <ProofField
                label="Dossier hash"
                value={dossier.dossierHash}
                display={shortHash(dossier.dossierHash)}
              />
              <ProofField
                label="Artifact root"
                value={artifactRootHash}
                display={shortHash(artifactRootHash)}
              />
              <ProofField
                label="Artifact count"
                value={String(dossier.artifacts.length)}
              />
              <ProofField label="Accepted state" value="true" display="true" />
              <ProofField
                label="Package hash"
                value={LIVE_PROOF_ANCHOR_CONFIG.packageHash}
                display={shortHash(LIVE_PROOF_ANCHOR_CONFIG.packageHash)}
              />
              <ProofField label="Network" value="Casper Testnet" />
              <ProofField
                label="Entry point"
                value={LIVE_PROOF_ANCHOR_CONFIG.entryPoint}
              />
              <ProofField
                label="Signer"
                value="Connection diagnostics only in Phase 2C"
                display="Connection diagnostics only in Phase 2C"
              />
            </div>
            <label className="mt-5 block text-xs font-semibold text-slate-300">
              Required payment amount, in motes
              <input
                className="mt-2 w-full rounded-lg border border-line bg-[#080d14] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-cyan/60"
                value={paymentAmount}
                inputMode="numeric"
                placeholder="Enter deliberate Testnet payment amount"
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </label>
            {message && (
              <p
                className={`mt-4 text-xs leading-5 ${
                  state === "confirmed"
                    ? "text-emerald"
                    : state === "rejected" || state === "failed"
                      ? "text-red-300"
                      : "text-gold"
                }`}
              >
                {message}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="gold"
                onClick={reviewInWallet}
                disabled={
                  !paymentIsValid ||
                  state === "awaiting-wallet-approval" ||
                  state === "confirming-on-casper"
                }
              >
                Validate payload only
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
