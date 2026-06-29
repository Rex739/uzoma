"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { Badge, Button, CopyButton } from "@/components/ui";
import { useAppState } from "@/components/state-provider";
import {
  abbreviatePublicKey,
  getCsprLiveDeployUrl,
  isLegacyDossier,
  isValidMotesPaymentAmount,
  type AnchorVerificationResponse,
  type LiveProofAnchorState,
} from "@/lib/casper/live-proof";
import {
  buildAnchorDossierTransaction,
  LIVE_PROOF_ANCHOR_CONFIG,
} from "@/lib/casper/live-proof-transaction";
import {
  connectCasperWallet,
  createCsprClickWalletClient,
  getCsprClickConfigIssue,
  type CsprClickWalletClient,
} from "@/lib/casper/csprclick-client";
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
  const { updateDossierCasperProof, markDossierCasperUnverified } =
    useAppState();
  const [eligibility, setEligibility] =
    useState<DossierAnchorEligibility | null>(null);
  const [state, setState] = useState<LiveProofAnchorState>("ready");
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [walletClient, setWalletClient] = useState<CsprClickWalletClient | null>(
    null,
  );
  const [publicKey, setPublicKey] = useState("");
  const [message, setMessage] = useState("");
  const [submittedHash, setSubmittedHash] = useState("");

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

  async function connectWallet() {
    setState("wallet-connecting");
    setMessage("");
    try {
      const client = await createCsprClickWalletClient();
      const connection = await connectCasperWallet(client);
      setWalletClient(client);
      setPublicKey(connection.publicKey);
      if (!connection.supportsTransactionV1) {
        setState("failed");
        setMessage(
          "Connected wallet does not advertise TransactionV1 approval support.",
        );
        return;
      }
      setState("reviewing");
    } catch (error) {
      setState("rejected");
      setMessage(
        error instanceof Error
          ? error.message
          : "Wallet connection was rejected or unavailable.",
      );
    }
  }

  async function verifySubmittedAnchor(transactionHash: string) {
    setState("confirming-on-casper");
    let result: AnchorVerificationResponse | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch("/api/casper/verify-anchor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionHash,
          expectedJobId: job.id,
          expectedDossierHash: dossier.dossierHash,
          expectedArtifactRootHash: artifactRootHash,
          expectedArtifactCount: dossier.artifacts.length,
          expectedPackageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
        }),
      });
      result = (await response.json()) as AnchorVerificationResponse;
      if (result.status !== "unverified") break;
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
    result ??= {
      status: "unverified",
      code: "VERIFY_TIMEOUT",
      message: "UNVERIFIED — CHECK AGAIN",
      transactionHash,
    };
    if (result.status === "confirmed") {
      setState("confirmed");
      updateDossierCasperProof(dossier.id, result.proof);
      setMessage("CONFIRMED ON CASPER TESTNET");
      return;
    }
    setState(result.status === "failed" ? "failed" : "unverified");
    markDossierCasperUnverified(dossier.id);
    setMessage(result.message || "UNVERIFIED — CHECK AGAIN");
  }

  async function reviewInWallet() {
    if (!walletClient || !publicKey) {
      setMessage("Connect Casper Wallet before wallet review.");
      return;
    }
    if (!paymentIsValid) {
      setMessage("Enter a deliberate positive payment amount in motes.");
      return;
    }
    setState("awaiting-wallet-approval");
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
      const transaction = buildAnchorDossierTransaction({
        signerPublicKey: publicKey,
        jobId: job.id,
        dossierHash: dossier.dossierHash,
        artifactRootHash,
        artifactCount: dossier.artifacts.length,
        paymentAmount,
      });
      const sendResult = await walletClient.sdk.send(
        transaction.transactionV1Json,
        publicKey,
      );
      if (!sendResult || sendResult.cancelled) {
        setState("rejected");
        setMessage("Wallet approval was cancelled. No anchor was confirmed.");
        return;
      }
      if (sendResult.error || !sendResult.transactionHash) {
        setState("failed");
        setMessage(
          "Wallet submission did not return a Casper transaction hash.",
        );
        return;
      }
      setState("submitted");
      setSubmittedHash(sendResult.transactionHash);
      setMessage("Transaction submitted. Waiting for independent readback.");
      await verifySubmittedAnchor(sendResult.transactionHash);
    } catch (error) {
      setState("failed");
      setMessage(
        error instanceof Error
          ? error.message
          : "Live proof transaction could not be prepared.",
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
                value={publicKey || "Connect wallet to review signer"}
                display={
                  publicKey
                    ? abbreviatePublicKey(publicKey)
                    : "Connect wallet to review signer"
                }
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
            {submittedHash && (
              <div className="mt-4 rounded-lg border border-cyan/15 bg-cyan/[.025] p-3">
                <p className="text-[10px] uppercase tracking-wider text-cyan">
                  Submitted transaction hash
                </p>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-[10px] text-slate-300">
                    {submittedHash}
                  </span>
                  <CopyButton value={submittedHash} label="Copy" />
                </div>
                {state === "confirmed" && (
                  <a
                    className="mt-3 inline-flex items-center gap-1 text-xs text-cyan hover:text-white"
                    href={getCsprLiveDeployUrl(submittedHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on CSPR.live <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            )}
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
                variant="secondary"
                onClick={connectWallet}
                loading={state === "wallet-connecting"}
              >
                <Wallet className="size-4" />
                {publicKey ? "Wallet connected" : "Connect Casper Wallet"}
              </Button>
              <Button
                variant="gold"
                onClick={reviewInWallet}
                disabled={
                  !publicKey ||
                  !paymentIsValid ||
                  state === "awaiting-wallet-approval" ||
                  state === "confirming-on-casper"
                }
                loading={
                  state === "awaiting-wallet-approval" ||
                  state === "confirming-on-casper"
                }
              >
                Review in wallet
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
