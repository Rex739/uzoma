import type * as CasperSdkTypes from "casper-js-sdk";
import * as casperSdkModule from "casper-js-sdk";
export { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-anchor-config";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-anchor-config";
import { normalizeWalletSignature } from "@/lib/casper/casper-wallet-client";
import type { CasperWalletSignatureResponse } from "@/lib/casper/casper-wallet-client";
import {
  getSignedTransactionBoundaryDiagnostic,
  getSignedTransactionApprovalDiagnostic,
} from "@/lib/casper/signed-transaction-diagnostics";

const CasperSdk = (
  "default" in casperSdkModule
    ? casperSdkModule.default
    : casperSdkModule
) as unknown as typeof CasperSdkTypes;

export type AnchorDossierTransactionInput = {
  signerPublicKey: string;
  jobId: string;
  dossierHash: string;
  artifactRootHash: string;
  artifactCount: number;
  paymentAmount: number | string;
};

export type AnchorDossierPayloadPreview = {
  packageHash: typeof LIVE_PROOF_ANCHOR_CONFIG.packageHash;
  chain: typeof LIVE_PROOF_ANCHOR_CONFIG.chainName;
  entryPoint: typeof LIVE_PROOF_ANCHOR_CONFIG.entryPoint;
  jobId: string;
  dossierHash: string;
  artifactRootHash: string;
  artifactCount: number;
  signerPublicKey: string;
  paymentAmount: string;
};

export type TransactionV1Json = {
  Version1: unknown;
};

export type AnchorDossierUnsignedTransaction = {
  transaction: CasperSdkTypes.Transaction;
  walletTransactionJson: unknown;
  walletTransactionJsonString: string;
  transactionV1Json: TransactionV1Json;
  payloadPreview: AnchorDossierPayloadPreview;
  transactionHash: string;
  unsigned: true;
};

export type AnchorDossierTransactionResult = {
  transactionV1Json: TransactionV1Json;
  payloadPreview: AnchorDossierPayloadPreview;
  transactionHash: string;
  unsigned: true;
};

export type SignedAnchorApprovalSummary = {
  approvalCount: number;
  signerMatches: boolean;
  signaturePresent: boolean;
};

export type SignatureAttachmentFailureCategory =
  | "TRANSACTION_WRAPPER_INVALID"
  | "TRANSACTION_V1_ORIGIN_MISSING"
  | "APPROVAL_ARRAY_UNAVAILABLE"
  | "SIGNATURE_ATTACHMENT_UNEXPECTED_FAILURE";

export type SignatureAttachmentDiagnostic = {
  category: SignatureAttachmentFailureCategory;
  wrapperConstructorName: string;
  hasGetTransactionV1: boolean;
  transactionV1Returned: boolean;
  transactionV1ApprovalArrayExists: boolean;
  approvalArrayExists: boolean;
  approvalCountBefore: number;
  approvalCountAfter: number;
  errorClassName?: string;
  sanitizedErrorMessage?: string;
};

export class SignatureAttachmentError extends Error {
  category: SignatureAttachmentFailureCategory;
  diagnostic: SignatureAttachmentDiagnostic;

  constructor(diagnostic: SignatureAttachmentDiagnostic) {
    super(
      "Wallet approval could not be attached to the transaction. No transaction was submitted.",
    );
    this.name = "SignatureAttachmentError";
    this.category = diagnostic.category;
    this.diagnostic = diagnostic;
  }
}

function requireNonEmpty(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function normalizePaymentAmount(value: number | string) {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error("paymentAmount must be a positive integer in motes");
  }
  const asNumber = Number(text);
  if (!Number.isSafeInteger(asNumber) || asNumber < 1) {
    throw new Error("paymentAmount must be a safe positive integer in motes");
  }
  return { text, number: asNumber };
}

function parseSignerPublicKey(value: string) {
  const trimmed = requireNonEmpty(value, "signerPublicKey");
  try {
    return CasperSdk.PublicKey.fromHex(trimmed);
  } catch {
    throw new Error("signerPublicKey must be a valid Casper public key hex");
  }
}

export function buildAnchorDossierTransaction(
  input: AnchorDossierTransactionInput,
): AnchorDossierTransactionResult {
  const result = buildAnchorDossierUnsignedTransaction(input);
  return {
    transactionV1Json: result.transactionV1Json,
    payloadPreview: result.payloadPreview,
    transactionHash: result.transactionHash,
    unsigned: true,
  };
}

export function buildAnchorDossierUnsignedTransaction(
  input: AnchorDossierTransactionInput,
): AnchorDossierUnsignedTransaction {
  const signerPublicKey = parseSignerPublicKey(input.signerPublicKey);
  const jobId = requireNonEmpty(input.jobId, "jobId");
  const dossierHash = requireNonEmpty(input.dossierHash, "dossierHash");
  const artifactRootHash = requireNonEmpty(
    input.artifactRootHash,
    "artifactRootHash",
  );
  if (!Number.isInteger(input.artifactCount) || input.artifactCount < 1) {
    throw new Error("artifactCount must be an integer greater than zero");
  }
  const paymentAmount = normalizePaymentAmount(input.paymentAmount);

  const transaction = new CasperSdk.ContractCallBuilder()
    .from(signerPublicKey)
    .byPackageHash(LIVE_PROOF_ANCHOR_CONFIG.packageHashBytes)
    .entryPoint(LIVE_PROOF_ANCHOR_CONFIG.entryPoint)
    .runtimeArgs(
      CasperSdk.Args.fromMap({
        job_id: CasperSdk.CLValue.newCLString(jobId),
        dossier_hash: CasperSdk.CLValue.newCLString(dossierHash),
        artifact_root_hash: CasperSdk.CLValue.newCLString(artifactRootHash),
        artifact_count: CasperSdk.CLValue.newCLUInt32(input.artifactCount),
      }),
    )
    .payment(paymentAmount.number, LIVE_PROOF_ANCHOR_CONFIG.gasPriceTolerance)
    .chainName(LIVE_PROOF_ANCHOR_CONFIG.chainName)
    .build();

  const transactionV1 = transaction.getTransactionV1();
  if (!transactionV1) {
    throw new Error("Casper SDK did not build a TransactionV1");
  }
  transaction.validate();
  const walletTransactionJson = transaction.toJSON();
  const payloadPreview = {
    packageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
    chain: LIVE_PROOF_ANCHOR_CONFIG.chainName,
    entryPoint: LIVE_PROOF_ANCHOR_CONFIG.entryPoint,
    jobId,
    dossierHash,
    artifactRootHash,
    artifactCount: input.artifactCount,
    signerPublicKey: signerPublicKey.toHex(),
    paymentAmount: paymentAmount.text,
  };

  return {
    transactionV1Json: {
      Version1: walletTransactionJson,
    },
    walletTransactionJson,
    walletTransactionJsonString: JSON.stringify(walletTransactionJson),
    transactionHash: transaction.hash.toHex(),
    unsigned: true,
    payloadPreview,
    transaction,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function namedArgsFromWalletJson(walletTransactionJson: unknown) {
  const named = asRecord(asRecord(asRecord(walletTransactionJson)?.payload)?.fields)
    ?.args;
  const items = asRecord(named)?.Named;
  return new Map(
    Array.isArray(items)
      ? items.flatMap((item) =>
          Array.isArray(item) && typeof item[0] === "string"
            ? ([[item[0], item[1]]] as const)
            : [],
        )
      : [],
  );
}

function stringAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const part of path) current = asRecord(current)?.[part];
  return typeof current === "string" ? current : undefined;
}

function numberAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const part of path) current = asRecord(current)?.[part];
  return typeof current === "number" ? current : undefined;
}

function approvalSummaryFromJson(
  walletJson: unknown,
  expectedSignerPublicKey: string,
): SignedAnchorApprovalSummary {
  const diagnostic = getSignedTransactionBoundaryDiagnostic(walletJson);
  const approval = getSignedTransactionApprovalDiagnostic({
    transactionJson: walletJson,
    connectedPublicKey: expectedSignerPublicKey,
  });
  return {
    approvalCount: diagnostic.approvalCount,
    signerMatches: approval.signerMatchesConnectedAccount === true,
    signaturePresent: approval.signaturePresent,
  };
}

function approvalArrayFacts(walletJson: unknown) {
  const approvals = asRecord(walletJson)?.approvals;
  return {
    approvalArrayExists: Array.isArray(approvals),
    approvalCount: Array.isArray(approvals) ? approvals.length : 0,
  };
}

export function getSafeApprovalCount(walletJson: unknown) {
  return approvalArrayFacts(walletJson).approvalCount;
}

function sanitizedErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 160)
    : "Unknown signature attachment error.";
}

function attachmentDiagnostic({
  transaction,
  category,
  approvalCountBefore,
  error,
}: {
  transaction: CasperSdkTypes.Transaction;
  category: SignatureAttachmentFailureCategory;
  approvalCountBefore: number;
  error?: unknown;
}): SignatureAttachmentDiagnostic {
  let walletJson: unknown;
  try {
    walletJson = transaction.toJSON();
  } catch {
    walletJson = null;
  }
  const approvalFacts = approvalArrayFacts(walletJson);
  let transactionV1Returned = false;
  let transactionV1ApprovalArrayExists = false;
  const hasGetTransactionV1 = typeof transaction.getTransactionV1 === "function";
  if (hasGetTransactionV1) {
    try {
      const transactionV1 = transaction.getTransactionV1();
      transactionV1Returned = Boolean(transactionV1);
      transactionV1ApprovalArrayExists = Array.isArray(transactionV1?.approvals);
    } catch {
      transactionV1Returned = false;
      transactionV1ApprovalArrayExists = false;
    }
  }
  return {
    category,
    wrapperConstructorName: transaction.constructor.name,
    hasGetTransactionV1,
    transactionV1Returned,
    transactionV1ApprovalArrayExists,
    approvalArrayExists: approvalFacts.approvalArrayExists,
    approvalCountBefore,
    approvalCountAfter: approvalFacts.approvalCount,
    errorClassName: error instanceof Error ? error.constructor.name : undefined,
    sanitizedErrorMessage: error ? sanitizedErrorMessage(error) : undefined,
  };
}

export function getSignedAnchorApprovalSummary({
  transactionJson,
  expectedSignerPublicKey,
}: {
  transactionJson: unknown;
  expectedSignerPublicKey: string;
}) {
  return approvalSummaryFromJson(transactionJson, expectedSignerPublicKey);
}

export function getSignedAnchorTransactionRelayJson({
  transaction,
  expectedSignerPublicKey,
  expected,
}: {
  transaction: CasperSdkTypes.Transaction;
  expectedSignerPublicKey: string;
  expected?: AnchorDossierPayloadPreview;
}) {
  const transactionJson = transaction.toJSON();
  if (expected) {
    assertAnchorTransactionIntegrity({
      transaction,
      expected,
      requireSignature: true,
    });
  }
  const summary = getSignedAnchorApprovalSummary({
    transactionJson,
    expectedSignerPublicKey,
  });
  if (
    summary.approvalCount < 1 ||
    !summary.signerMatches ||
    !summary.signaturePresent
  ) {
    throw new Error(
      "Wallet approval could not be attached to the transaction. No transaction was submitted.",
    );
  }
  return transactionJson;
}

function bytesArg(args: Map<string, unknown>, name: string) {
  const bytes = asRecord(args.get(name))?.bytes;
  return typeof bytes === "string" ? bytes : undefined;
}

function expectedStringBytes(value: string) {
  const encoded = new TextEncoder().encode(value);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, encoded.length, true);
  return [...length, ...encoded]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function expectedU32Bytes(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assertAnchorTransactionIntegrity({
  transaction,
  expected,
  requireSignature = false,
}: {
  transaction: CasperSdkTypes.Transaction;
  expected: AnchorDossierPayloadPreview;
  requireSignature?: boolean;
}) {
  const walletJson = transaction.toJSON();
  const args = namedArgsFromWalletJson(walletJson);
  const approvals = asRecord(walletJson)?.approvals;
  const approvalSigner = Array.isArray(approvals)
    ? approvals
        .map((approval) => asRecord(approval)?.signer)
        .find((signer): signer is string => typeof signer === "string")
    : undefined;

  const failures = [
    stringAt(walletJson, ["payload", "chain_name"]) === expected.chain
      ? undefined
      : "chain name mismatch",
    stringAt(walletJson, [
      "payload",
      "fields",
      "target",
      "Stored",
      "id",
      "ByPackageHash",
      "addr",
    ]) === LIVE_PROOF_ANCHOR_CONFIG.packageHashBytes
      ? undefined
      : "package hash mismatch",
    stringAt(walletJson, ["payload", "fields", "target", "Stored", "runtime"]) ===
    LIVE_PROOF_ANCHOR_CONFIG.runtime
      ? undefined
      : "runtime mismatch",
    stringAt(walletJson, ["payload", "fields", "entry_point", "Custom"]) ===
    expected.entryPoint
      ? undefined
      : "entry point mismatch",
    bytesArg(args, "job_id") === expectedStringBytes(expected.jobId)
      ? undefined
      : "job ID mismatch",
    bytesArg(args, "dossier_hash") === expectedStringBytes(expected.dossierHash)
      ? undefined
      : "dossier hash mismatch",
    bytesArg(args, "artifact_root_hash") ===
    expectedStringBytes(expected.artifactRootHash)
      ? undefined
      : "artifact root mismatch",
    bytesArg(args, "artifact_count") === expectedU32Bytes(expected.artifactCount)
      ? undefined
      : "artifact count mismatch",
    String(
      numberAt(walletJson, [
        "payload",
        "pricing_mode",
        "PaymentLimited",
        "payment_amount",
      ]),
    ) === expected.paymentAmount
      ? undefined
      : "payment amount mismatch",
    requireSignature &&
    approvalSigner?.toLowerCase() !== expected.signerPublicKey.toLowerCase()
      ? "signature signer mismatch"
      : undefined,
  ].filter((failure): failure is string => Boolean(failure));

  if (failures.length > 0) {
    throw new Error(`Anchor transaction integrity failed: ${failures.join(", ")}`);
  }
  if (!requireSignature) {
    transaction.validate();
  }
}

export function attachWalletSignatureToAnchorTransaction({
  transaction,
  signatureResponse,
  signingPublicKeyHex,
  expected,
}: {
  transaction: CasperSdkTypes.Transaction;
  signatureResponse: CasperWalletSignatureResponse;
  signingPublicKeyHex: string;
  expected: AnchorDossierPayloadPreview;
}) {
  if (signingPublicKeyHex.toLowerCase() !== expected.signerPublicKey.toLowerCase()) {
    throw new Error("Connected public key does not match transaction initiator.");
  }
  const signature = normalizeWalletSignature(signatureResponse);
  const publicKey = CasperSdk.PublicKey.fromHex(signingPublicKeyHex);
  const beforeJson = transaction.toJSON();
  const beforeFacts = approvalArrayFacts(beforeJson);
  if (typeof transaction.setSignature !== "function") {
    throw new SignatureAttachmentError(
      attachmentDiagnostic({
        transaction,
        category: "TRANSACTION_WRAPPER_INVALID",
        approvalCountBefore: beforeFacts.approvalCount,
      }),
    );
  }
  if (!beforeFacts.approvalArrayExists) {
    throw new SignatureAttachmentError(
      attachmentDiagnostic({
        transaction,
        category: "APPROVAL_ARRAY_UNAVAILABLE",
        approvalCountBefore: beforeFacts.approvalCount,
      }),
    );
  }
  const beforeBoundary = getSignedTransactionBoundaryDiagnostic(beforeJson);
  if (beforeBoundary.transactionVariant !== "TransactionV1") {
    throw new SignatureAttachmentError(
      attachmentDiagnostic({
        transaction,
        category: "TRANSACTION_V1_ORIGIN_MISSING",
        approvalCountBefore: beforeFacts.approvalCount,
      }),
    );
  }
  try {
    transaction.setSignature(signature, publicKey);
  } catch (error) {
    throw new SignatureAttachmentError(
      attachmentDiagnostic({
        transaction,
        category: "SIGNATURE_ATTACHMENT_UNEXPECTED_FAILURE",
        approvalCountBefore: beforeFacts.approvalCount,
        error,
      }),
    );
  }
  const signedJson = transaction.toJSON();
  const afterFacts = approvalArrayFacts(signedJson);
  if (!afterFacts.approvalArrayExists) {
    throw new SignatureAttachmentError(
      attachmentDiagnostic({
        transaction,
        category: "APPROVAL_ARRAY_UNAVAILABLE",
        approvalCountBefore: beforeFacts.approvalCount,
      }),
    );
  }
  return { transaction, signedJson };
}

export function applyWalletSignatureToAnchorTransaction({
  transaction,
  signatureResponse,
  signingPublicKeyHex,
  expected,
}: {
  transaction: CasperSdkTypes.Transaction;
  signatureResponse: CasperWalletSignatureResponse;
  signingPublicKeyHex: string;
  expected: AnchorDossierPayloadPreview;
}) {
  const attached = attachWalletSignatureToAnchorTransaction({
    transaction,
    signatureResponse,
    signingPublicKeyHex,
    expected,
  });
  assertAnchorTransactionIntegrity({
    transaction: attached.transaction,
    expected,
    requireSignature: true,
  });
  getSignedAnchorTransactionRelayJson({
    transaction: attached.transaction,
    expectedSignerPublicKey: signingPublicKeyHex,
    expected,
  });
  return attached.transaction;
}
