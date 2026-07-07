"use client";

import { useState } from "react";
import { Button, Badge } from "@/components/ui";
import {
  connectNativeCasperWallet,
  messageForWalletError,
  normalizeWalletSignatureWithDiagnostic,
} from "@/lib/casper/casper-wallet-client";
import {
  attachWalletSignatureToAnchorTransaction,
  buildAnchorDossierUnsignedTransaction,
} from "@/lib/casper/live-proof-transaction";
import { REVIEWED_TESTNET_ANCHOR_FEE_POLICY } from "@/lib/casper/anchor-fee-policy";
import {
  getSignedTransactionApprovalDiagnostic,
  getSignedTransactionBoundaryDiagnostic,
} from "@/lib/casper/signed-transaction-diagnostics";

type HarnessResult = {
  walletResponseReceived: boolean;
  cancelled: boolean;
  signatureFieldPresent: boolean;
  signatureRuntimeCategory: string;
  primaryNormalization: string;
  signatureHexFieldPresent: boolean;
  hexFallbackNormalization: string;
  selectedSource: string;
  normalizedByteLength: number;
  normalizationFailure?: string;
  signatureAttachmentMethod: string;
  attachmentCompletedWithoutException: boolean;
  signatureAttachmentStatus: string;
  signatureAttachmentExceptionClass?: string;
  signatureAttachmentExceptionMessage?: string;
  approvalCount: number;
  approvalCountValid: boolean;
  signerPresent: boolean;
  signaturePresent: boolean;
  approvalSignerMatchesInitiator: boolean;
  approvalSignerMatchesConnectedWallet: boolean;
  payloadUnchanged: boolean;
  finalStructuralValidity: boolean;
};

const harnessPayload = {
  jobId: "harness-local-proof-check",
  dossierHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  artifactRootHash:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  artifactCount: 4,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function payloadFingerprint(transactionJson: unknown) {
  const payload = asRecord(transactionJson)?.payload;
  return payload ? JSON.stringify(payload) : null;
}

export function CasperSignatureHarness() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">(
    "idle",
  );
  const [message, setMessage] = useState("No wallet request has been made.");
  const [result, setResult] = useState<HarnessResult | null>(null);

  async function runHarness() {
    setStatus("running");
    setMessage("Waiting for Casper Wallet approval…");
    setResult(null);
    try {
      const connection = await connectNativeCasperWallet();
      const unsigned = buildAnchorDossierUnsignedTransaction({
        signerPublicKey: connection.publicKey,
        ...harnessPayload,
        paymentAmount: REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
      });
      const response = await connection.provider.sign(
        unsigned.walletTransactionJsonString,
        connection.publicKey,
      );
      if (response.cancelled) {
        setResult({
          walletResponseReceived: true,
          cancelled: true,
          signatureFieldPresent: false,
          signatureRuntimeCategory: "missing",
          primaryNormalization: "not used",
          signatureHexFieldPresent: false,
          hexFallbackNormalization: "not used",
          selectedSource: "none",
          normalizedByteLength: 0,
          normalizationFailure: "none",
          signatureAttachmentMethod: "not used",
          attachmentCompletedWithoutException: false,
          signatureAttachmentStatus: "not used",
          approvalCount: 0,
          approvalCountValid: false,
          signerPresent: false,
          signaturePresent: false,
          approvalSignerMatchesInitiator: false,
          approvalSignerMatchesConnectedWallet: false,
          payloadUnchanged: false,
          finalStructuralValidity: false,
        });
        setStatus("failed");
        setMessage("Wallet signing cancelled.");
        return;
      }
      const signatureDiagnostic =
        normalizeWalletSignatureWithDiagnostic(response).diagnostic;
      let signedJson: unknown = null;
      let attachmentCompletedWithoutException = false;
      let signatureAttachmentStatus = "SIGNATURE_ATTACHMENT_EXCEPTION";
      let signatureAttachmentExceptionClass: string | undefined;
      let signatureAttachmentExceptionMessage: string | undefined;
      try {
        const attached = attachWalletSignatureToAnchorTransaction({
          transaction: unsigned.transaction,
          signatureResponse: response,
          signingPublicKeyHex: connection.publicKey,
          expected: unsigned.payloadPreview,
        });
        signedJson = attached.signedJson;
        attachmentCompletedWithoutException = true;
        signatureAttachmentStatus = "success";
      } catch (error) {
        signedJson = null;
        signatureAttachmentExceptionClass =
          error instanceof Error ? error.constructor.name : "unknown";
        signatureAttachmentExceptionMessage =
          error instanceof Error
            ? error.message.slice(0, 160)
            : "Unknown signature attachment error.";
      }
      const boundary = getSignedTransactionBoundaryDiagnostic(signedJson);
      const approval = getSignedTransactionApprovalDiagnostic({
        transactionJson: signedJson,
        connectedPublicKey: connection.publicKey,
      });
      const approvalCountValid = boundary.approvalCount >= 1;
      const approvalSignerMatchesInitiator = approval.signerMatchesInitiator;
      const approvalSignerMatchesConnectedWallet =
        approval.signerMatchesConnectedAccount === true;
      const payloadUnchanged =
        payloadFingerprint(signedJson) ===
        payloadFingerprint(unsigned.walletTransactionJson);
      const finalStructuralValidity =
        boundary.payloadShapeValid &&
        approvalCountValid &&
        approval.signerPresent &&
        approval.signaturePresent &&
        approvalSignerMatchesInitiator &&
        approvalSignerMatchesConnectedWallet &&
        payloadUnchanged;
      setResult({
        walletResponseReceived: signatureDiagnostic.walletResponseReceived,
        cancelled: signatureDiagnostic.cancelled,
        signatureFieldPresent: signatureDiagnostic.signatureFieldPresent,
        signatureRuntimeCategory: signatureDiagnostic.signatureRuntimeCategory,
        primaryNormalization: signatureDiagnostic.primaryNormalization,
        signatureHexFieldPresent: signatureDiagnostic.signatureHexFieldPresent,
        hexFallbackNormalization: signatureDiagnostic.hexFallbackNormalization,
        selectedSource: signatureDiagnostic.selectedSource,
        normalizedByteLength: signatureDiagnostic.normalizedByteLength,
        normalizationFailure: signatureDiagnostic.failure ?? "none",
        signatureAttachmentMethod: "Transaction#setSignature",
        attachmentCompletedWithoutException,
        signatureAttachmentStatus,
        signatureAttachmentExceptionClass,
        signatureAttachmentExceptionMessage,
        approvalCount: boundary.approvalCount,
        approvalCountValid,
        signerPresent: approval.signerPresent,
        signaturePresent: approval.signaturePresent,
        approvalSignerMatchesInitiator,
        approvalSignerMatchesConnectedWallet,
        payloadUnchanged,
        finalStructuralValidity,
      });
      setStatus(finalStructuralValidity ? "done" : "failed");
      setMessage(
        finalStructuralValidity
          ? "Signature approval inspected locally. No transaction submitted."
          : "Wallet approval could not be attached to the transaction. No transaction was submitted.",
      );
    } catch (error) {
      setStatus("failed");
      setMessage(messageForWalletError(error));
    }
  }

  return (
    <main className="grid-bg min-h-screen bg-ink px-5 py-10 text-white">
      <section className="mx-auto max-w-3xl rounded-2xl border border-line bg-[#0b111b]/90 p-6 shadow-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="cyan">Internal diagnostic</Badge>
          <Badge tone="gold">NO TRANSACTION SUBMITTED</Badge>
        </div>
        <h1 className="mt-5 text-2xl font-semibold">
          Casper Wallet signature harness
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This development-only harness requests one wallet signature for a local
          unsigned TransactionV1, attaches it with the same adapter used by Live
          Proof Mode, then stops before relay or RPC submission.
        </p>
        <div className="mt-6 rounded-xl border border-gold/20 bg-gold/[.035] p-4 text-xs leading-5 text-gold/90">
          It does not call the relay, submit a transaction, write to Casper
          Testnet, or display raw signature bytes.
        </div>
        <div className="mt-6">
          <Button onClick={runHarness} disabled={status === "running"}>
            {status === "running" ? "Waiting for wallet…" : "Run local signature check"}
          </Button>
        </div>
        <p
          className={`mt-5 text-sm ${
            status === "failed"
              ? "text-red-300"
              : status === "done"
                ? "text-emerald"
                : "text-slate-400"
          }`}
        >
          {message}
        </p>
        {result && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            {Object.entries(result).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-line bg-black/10 p-3">
                <dt className="eyebrow">{key.replace(/[A-Z]/g, " $&")}</dt>
                <dd className="mt-2 font-mono text-sm text-slate-100">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </main>
  );
}
