"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { useAppState } from "@/components/state-provider";
import { Badge, Button, CopyButton } from "@/components/ui";
import {
  getAnchorFeePolicyDetails,
  isValidAnchorFeePolicy,
  REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
} from "@/lib/casper/anchor-fee-policy";
import {
  connectNativeCasperWallet,
  messageForWalletError,
  requestNativeCasperWalletSignature,
  type CasperWalletConnection,
} from "@/lib/casper/casper-wallet-client";
import { getLiveAnchorActionGates } from "@/lib/casper/anchor-action-gates";
import {
  abbreviatePublicKey,
  getCsprLiveDeployUrl,
  isLegacyDossier,
  type AnchorVerificationResponse,
  type LiveProofAnchorState,
} from "@/lib/casper/live-proof";
import {
  applyWalletSignatureToAnchorTransaction,
  buildAnchorDossierUnsignedTransaction,
  getSignedAnchorTransactionRelayJson,
  LIVE_PROOF_ANCHOR_CONFIG,
  type AnchorDossierUnsignedTransaction,
} from "@/lib/casper/live-proof-transaction";
import { getSignedTransactionBoundaryDiagnostic } from "@/lib/casper/signed-transaction-diagnostics";
import {
  computeDossierIntegrity,
  getDossierAnchorEligibility,
  type DossierAnchorEligibility,
} from "@/lib/dossiers/evidence-integrity";
import type { BuildDossier, BuildJob } from "@/lib/types";
import { shortHash } from "@/lib/utils";

const VERIFY_ATTEMPTS = 6;
const VERIFY_INTERVAL_MS = 8_000;

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyAnchor(input: {
  transactionHash: string;
  dossier: BuildDossier;
}) {
  const response = await fetch("/api/casper/verify-anchor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionHash: input.transactionHash,
      expectedJobId: input.dossier.jobId,
      expectedDossierHash: input.dossier.dossierHash,
      expectedArtifactRootHash: input.dossier.artifactRootHash,
      expectedArtifactCount: input.dossier.artifacts.length,
      expectedPackageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
    }),
  });
  return (await response.json()) as AnchorVerificationResponse;
}

async function submitAnchorThroughRelay(input: {
  signedTransaction: unknown;
  dossier: BuildDossier;
}) {
  const clientDiagnostic = getSignedTransactionBoundaryDiagnostic(
    input.signedTransaction,
  );
  const response = await fetch("/api/casper/submit-anchor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      signedTransaction: input.signedTransaction,
      expected: {
        jobId: input.dossier.jobId,
        dossierHash: input.dossier.dossierHash,
        artifactRootHash: input.dossier.artifactRootHash,
        artifactCount: input.dossier.artifacts.length,
        expectedPackageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
        expectedNetwork: LIVE_PROOF_ANCHOR_CONFIG.chainName,
      },
      clientDiagnostic,
    }),
  });
  const result = (await response.json()) as
    | { status: "submitted"; transactionHash: string }
    | { status: "failed"; code: string; message: string };
  if (!response.ok || result.status !== "submitted") {
    throw new Error(
      result.status === "failed"
        ? result.message
        : "Signed transaction could not be relayed.",
    );
  }
  return result.transactionHash;
}

export function DossierAnchorAction({ dossier, job }: Props) {
  const { updateDossierCasperProof, markDossierCasperUnverified } =
    useAppState();
  const [eligibility, setEligibility] =
    useState<DossierAnchorEligibility | null>(null);
  const [state, setState] = useState<LiveProofAnchorState>("not-anchored");
  const [modalOpen, setModalOpen] = useState(false);
  const [policyDetailsOpen, setPolicyDetailsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<CasperWalletConnection | null>(
    null,
  );
  const [unsignedTransaction, setUnsignedTransaction] =
    useState<AnchorDossierUnsignedTransaction | null>(null);
  const [transactionHash, setTransactionHash] = useState("");

  const artifactRootHash = dossier.artifactRootHash ?? "";
  const isLegacy = isLegacyDossier(dossier);
  const paymentPolicyValid = isValidAnchorFeePolicy(
    REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
  );
  const gates = getLiveAnchorActionGates({
    paymentPolicyValid,
    connection,
    eligibilityReady: Boolean(eligibility),
    anchorEligible: Boolean(eligibility?.eligible),
    unsignedTransactionReady: Boolean(unsignedTransaction),
    state,
  });
  const policyDetails = getAnchorFeePolicyDetails({
    expanded: policyDetailsOpen,
  });

  useEffect(() => {
    let active = true;
    void getDossierAnchorEligibility(dossier).then((result) => {
      if (active) {
        setEligibility(result);
        setState(result.eligible ? "ready" : "not-anchored");
      }
    });
    return () => {
      active = false;
    };
  }, [dossier]);

  const readinessMessages = useMemo(() => {
    if (!eligibility) return ["Checking deterministic evidence integrity…"];
    return eligibility.messages;
  }, [eligibility]);

  if (isLegacy || dossier.casperAnchorStatus === "confirmed") {
    return null;
  }

  if (!eligibility?.eligible) {
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

  async function buildFreshTransaction(publicKey: string) {
    if (!paymentPolicyValid) {
      throw new Error("Reviewed Testnet payment policy is unavailable.");
    }
    const integrity = await computeDossierIntegrity(dossier);
    if (
      integrity.dossierHash !== dossier.dossierHash ||
      integrity.artifactRootHash !== artifactRootHash
    ) {
      throw new Error(
        "Evidence changed after acceptance. Re-accept the dossier before anchoring.",
      );
    }
    return buildAnchorDossierUnsignedTransaction({
      signerPublicKey: publicKey,
      jobId: dossier.jobId,
      dossierHash: dossier.dossierHash,
      artifactRootHash,
      artifactCount: dossier.artifacts.length,
      paymentAmount: REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
    });
  }

  async function connectWallet() {
    if (!gates.connectEnabled) {
      setMessage("Reviewed Testnet payment policy is unavailable.");
      return;
    }
    setState("connecting-wallet");
    setMessage("Waiting for Casper Wallet…");
    setConnection(null);
    setUnsignedTransaction(null);
    setTransactionHash("");
    try {
      const walletConnection = await connectNativeCasperWallet();
      const transaction = await buildFreshTransaction(walletConnection.publicKey);
      setConnection(walletConnection);
      setUnsignedTransaction(transaction);
      setState("wallet-connected");
      setMessage(
        "Casper Wallet connected. Review the payload, then continue to wallet approval.",
      );
    } catch (error) {
      setState("failed");
      setMessage(messageForWalletError(error));
    }
  }

  async function reviewInWallet() {
    if (!gates.reviewEnabled || !connection || !unsignedTransaction) {
      setMessage("Connect Casper Wallet before wallet review.");
      return;
    }
    setState("awaiting-wallet-approval");
    setMessage("Awaiting Casper Wallet approval…");
    try {
      const fresh = await buildFreshTransaction(connection.publicKey);
      const signatureResponse = await requestNativeCasperWalletSignature({
        provider: connection.provider,
        transactionJson: fresh.walletTransactionJsonString,
        signingPublicKeyHex: connection.publicKey,
      });
      const signed = applyWalletSignatureToAnchorTransaction({
        transaction: fresh.transaction,
        signatureResponse,
        signingPublicKeyHex: connection.publicKey,
        expected: fresh.payloadPreview,
      });
      getSignedAnchorTransactionRelayJson({
        transaction: signed,
        expectedSignerPublicKey: connection.publicKey,
        expected: fresh.payloadPreview,
      });
      setUnsignedTransaction({ ...fresh, transaction: signed });
      setState("signed");
      setMessage(
        "Wallet signature received. This is not submitted or confirmed yet.",
      );
    } catch (error) {
      const text = messageForWalletError(error);
      setState(text === "SIGNING CANCELLED" ? "signing-cancelled" : "failed");
      setMessage(text);
    }
  }

  async function submitSignedTransaction() {
    if (!unsignedTransaction || state !== "signed" || !connection) return;
    setState("submitting");
    setMessage("Relaying wallet-approved transaction to Casper Testnet…");
    try {
      const signedTransaction = getSignedAnchorTransactionRelayJson({
        transaction: unsignedTransaction.transaction,
        expectedSignerPublicKey: connection.publicKey,
        expected: unsignedTransaction.payloadPreview,
      });
      const submittedHash = await submitAnchorThroughRelay({
        signedTransaction,
        dossier,
      });
      setTransactionHash(submittedHash);
      setState("submitted");
      setMessage("SUBMITTED TO CASPER TESTNET. Verification is starting…");
      await verifySubmittedAnchor(submittedHash);
    } catch (error) {
      setState("failed");
      setMessage(
        error instanceof Error
          ? error.message
          : "Wallet approval could not be attached to the transaction. No transaction was submitted.",
      );
    }
  }

  async function verifySubmittedAnchor(submittedHash = transactionHash) {
    if (!submittedHash) return;
    setState("verifying");
    setMessage("VERIFYING ON CASPER…");
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
      const result = await verifyAnchor({ transactionHash: submittedHash, dossier });
      if (result.status === "confirmed") {
        updateDossierCasperProof(dossier.id, result.proof);
        setState("confirmed");
        setMessage(
          "CONFIRMED ON CASPER TESTNET. Stored in this browser. Public verifier coming next.",
        );
        return;
      }
      if (result.status === "failed") {
        setState("failed");
        setMessage(result.message);
        return;
      }
      if (attempt < VERIFY_ATTEMPTS - 1) await delay(VERIFY_INTERVAL_MS);
    }
    markDossierCasperUnverified(dossier.id);
    setState("unverified");
    setMessage("UNVERIFIED — CHECK AGAIN");
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
              Casper Testnet · User-controlled Casper Wallet flow
            </p>
          </div>
          <Badge tone="cyan">{state === "not-anchored" ? "Ready" : state}</Badge>
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
                  holds your wallet keys or submits an unsigned transaction on
                  your behalf.
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
                label="Execution budget"
                value={REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes}
                display={`${REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes} motes`}
              />
            </div>
            <section className="mt-5 rounded-xl border border-gold/20 bg-gold/[.035] p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="eyebrow text-gold">
                    Casper Testnet execution budget
                  </p>
                  <p className="mt-2 font-mono text-sm font-semibold text-white">
                    {REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes} motes
                  </p>
                  <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">
                    This configured transaction budget applies to the Build
                    Dossier Registry anchor. Casper Wallet will show the exact
                    transaction before you approve it.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <CopyButton
                    value={REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes}
                    label="Copy motes"
                  />
                </div>
              </div>
              <button
                type="button"
                className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition hover:text-cyan"
                onClick={() => setPolicyDetailsOpen((open) => !open)}
              >
                View technical policy details
              </button>
              {policyDetails.length > 0 && (
                <div className="mt-3 rounded-lg border border-line bg-black/10 p-3">
                  {policyDetails.map((detail) => (
                    <ProofField
                      key={detail.label}
                      label={detail.label}
                      value={detail.value}
                      display={
                        detail.label === "Reference transaction"
                          ? shortHash(detail.value)
                          : detail.value
                      }
                    />
                  ))}
                  <div className="mt-2 flex justify-end">
                    <CopyButton
                      value={
                        REVIEWED_TESTNET_ANCHOR_FEE_POLICY.sourceTransactionHash
                      }
                      label="Copy reference"
                    />
                  </div>
                </div>
              )}
            </section>
            <section className="mt-4 rounded-xl border border-line bg-[#080d14] p-4">
              <p className="eyebrow">Connected wallet identity</p>
              <ProofField
                label="Connected key"
                value={connection?.publicKey ?? "Not connected"}
                display={
                  connection?.publicKey
                    ? abbreviatePublicKey(connection.publicKey)
                    : "Not connected"
                }
              />
              {connection?.publicKey && (
                <ProofField
                  label="TransactionV1"
                  value={
                    gates.transactionV1Supported
                      ? "sign-transactionv1 supported"
                      : "Unsupported"
                  }
                  display={
                    gates.transactionV1Supported
                      ? "sign-transactionv1 supported"
                      : "Unsupported"
                  }
                />
              )}
            </section>
            <div className="mt-4 rounded-xl border border-gold/20 bg-gold/[.03] p-3 text-xs leading-5 text-gold/90">
              This creates a real Casper Testnet transaction. Uzoma never holds
              your wallet keys. Transaction submission is relayed through
              Uzoma’s verification service; Uzoma cannot sign or alter your
              wallet-approved transaction.
            </div>
            {message && (
              <p
                className={`mt-4 text-xs leading-5 ${
                  state === "confirmed"
                    ? "text-emerald"
                    : state === "failed"
                      ? "text-red-300"
                      : "text-gold"
                }`}
              >
                {message}
              </p>
            )}
            {transactionHash && state === "confirmed" && (
              <a
                className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan"
                href={getCsprLiveDeployUrl(transactionHash)}
                target="_blank"
                rel="noreferrer"
              >
                View confirmed transaction
                <ExternalLink className="size-3" />
              </a>
            )}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={connectWallet}
                disabled={!gates.connectEnabled}
              >
                <Wallet className="size-4" />
                Connect Casper Wallet
              </Button>
              {gates.reviewVisible && (
                <Button
                  variant={gates.reviewEnabled ? "gold" : "secondary"}
                  onClick={reviewInWallet}
                  disabled={!gates.reviewEnabled}
                >
                  Review in wallet
                </Button>
              )}
              {state === "signed" && (
                <Button variant="gold" onClick={submitSignedTransaction}>
                  Submit to Casper Testnet
                </Button>
              )}
              {(state === "unverified" || transactionHash) && (
                <Button
                  variant="secondary"
                  onClick={() => verifySubmittedAnchor()}
                  disabled={!transactionHash || state === "verifying"}
                >
                  Verify on Casper
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
