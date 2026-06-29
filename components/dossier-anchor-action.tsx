"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { useAppState } from "@/components/state-provider";
import { Badge, Button } from "@/components/ui";
import {
  CasperWalletClientError,
  connectNativeCasperWallet,
  signWithNativeCasperWallet,
  type CasperWalletConnection,
} from "@/lib/casper/casper-wallet-client";
import {
  abbreviatePublicKey,
  getCsprLiveDeployUrl,
  isLegacyDossier,
  isValidMotesPaymentAmount,
  type AnchorVerificationResponse,
  type LiveProofAnchorState,
} from "@/lib/casper/live-proof";
import {
  applyWalletSignatureToAnchorTransaction,
  buildAnchorDossierUnsignedTransaction,
  checkCasperTestnetRpcBrowserReadiness,
  LIVE_PROOF_ANCHOR_CONFIG,
  submitSignedAnchorTransaction,
  type AnchorDossierUnsignedTransaction,
} from "@/lib/casper/live-proof-transaction";
import {
  computeDossierIntegrity,
  getDossierAnchorEligibility,
  type DossierAnchorEligibility,
} from "@/lib/dossiers/evidence-integrity";
import type { BuildDossier, BuildJob } from "@/lib/types";
import { shortHash } from "@/lib/utils";

const DEFAULT_TESTNET_RPC = "https://node.testnet.casper.network/rpc";
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

function messageForWalletError(error: unknown) {
  if (error instanceof CasperWalletClientError) {
    const messages: Record<typeof error.code, string> = {
      CASPER_WALLET_NOT_INSTALLED:
        "Casper Wallet is not installed or is unavailable in this browser.",
      CASPER_WALLET_LOADING: "Casper Wallet is still loading. Try again.",
      CASPER_WALLET_LOCKED: "Casper Wallet is locked. Unlock it and retry.",
      CASPER_WALLET_CONNECTION_DECLINED: "Wallet connection declined.",
      CASPER_WALLET_NO_ACTIVE_ACCOUNT:
        "No active Casper Wallet account was returned.",
      CASPER_WALLET_TRANSACTION_V1_UNSUPPORTED:
        "The active account does not advertise sign-transactionv1 support.",
      CASPER_WALLET_PROVIDER_UNSUPPORTED:
        "Casper Wallet provider API is unavailable or unsupported.",
      CASPER_WALLET_SIGNING_CANCELLED: "SIGNING CANCELLED",
      CASPER_WALLET_SIGNING_ERROR: "Casper Wallet signing failed.",
    };
    return messages[error.code];
  }
  return error instanceof Error ? error.message : "Live anchor flow failed.";
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

export function DossierAnchorAction({ dossier, job }: Props) {
  const { updateDossierCasperProof, markDossierCasperUnverified } =
    useAppState();
  const [eligibility, setEligibility] =
    useState<DossierAnchorEligibility | null>(null);
  const [state, setState] = useState<LiveProofAnchorState>("not-anchored");
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<CasperWalletConnection | null>(
    null,
  );
  const [unsignedTransaction, setUnsignedTransaction] =
    useState<AnchorDossierUnsignedTransaction | null>(null);
  const [transactionHash, setTransactionHash] = useState("");

  const artifactRootHash = dossier.artifactRootHash ?? "";
  const isLegacy = isLegacyDossier(dossier);
  const paymentIsValid = isValidMotesPaymentAmount(paymentAmount);
  const rpcUrl =
    process.env.NEXT_PUBLIC_CASPER_TESTNET_RPC?.trim() || DEFAULT_TESTNET_RPC;

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
      paymentAmount,
    });
  }

  async function connectWallet() {
    if (!paymentIsValid) {
      setMessage("Enter a deliberate positive payment amount in motes first.");
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
    if (!connection || !unsignedTransaction) {
      setMessage("Connect Casper Wallet before wallet review.");
      return;
    }
    setState("awaiting-wallet-approval");
    setMessage("Awaiting Casper Wallet approval…");
    try {
      const fresh = await buildFreshTransaction(connection.publicKey);
      const signature = await signWithNativeCasperWallet({
        provider: connection.provider,
        transactionJson: fresh.walletTransactionJsonString,
        signingPublicKeyHex: connection.publicKey,
      });
      const signed = applyWalletSignatureToAnchorTransaction({
        transaction: fresh.transaction,
        signature,
        signingPublicKeyHex: connection.publicKey,
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
    if (!unsignedTransaction || state !== "signed") return;
    setState("submitting");
    setMessage("Checking public Casper Testnet RPC availability…");
    try {
      await checkCasperTestnetRpcBrowserReadiness(rpcUrl);
      setMessage("Submitting signed transaction to Casper Testnet…");
      const submittedHash = await submitSignedAnchorTransaction({
        transaction: unsignedTransaction.transaction,
        rpcUrl,
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
          : "Signed transaction could not be submitted from this browser.",
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
                label="Payment"
                value={paymentAmount || "Not set"}
                display={paymentAmount || "Not set"}
              />
              <ProofField
                label="Connected key"
                value={connection?.publicKey ?? "Not connected"}
                display={
                  connection?.publicKey
                    ? abbreviatePublicKey(connection.publicKey)
                    : "Not connected"
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
                onChange={(event) => {
                  setPaymentAmount(event.target.value);
                  setConnection(null);
                  setUnsignedTransaction(null);
                  setTransactionHash("");
                  setState("reviewing");
                }}
              />
            </label>
            <div className="mt-4 rounded-xl border border-gold/20 bg-gold/[.03] p-3 text-xs leading-5 text-gold/90">
              This creates a real Casper Testnet transaction. Uzoma never holds
              your wallet keys or submits an unsigned transaction on your behalf.
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
                disabled={
                  !paymentIsValid ||
                  state === "connecting-wallet" ||
                  state === "awaiting-wallet-approval" ||
                  state === "submitting" ||
                  state === "verifying"
                }
              >
                <Wallet className="size-4" />
                Connect Casper Wallet
              </Button>
              <Button
                variant="gold"
                onClick={reviewInWallet}
                disabled={
                  !connection ||
                  state === "awaiting-wallet-approval" ||
                  state === "submitting" ||
                  state === "verifying"
                }
              >
                Review in wallet
              </Button>
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
