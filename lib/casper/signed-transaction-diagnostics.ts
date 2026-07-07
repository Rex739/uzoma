import type * as CasperSdkTypes from "casper-js-sdk";
import * as casperSdkModule from "casper-js-sdk";

const CasperSdk = (
  "default" in casperSdkModule
    ? casperSdkModule.default
    : casperSdkModule
) as unknown as typeof CasperSdkTypes;

export type SignedTransactionBoundaryDiagnostic = {
  transactionVariant: "TransactionV1" | "unknown";
  approvalContainerPath: string | null;
  approvalCount: number;
  hasSigner: boolean;
  hasNonEmptySignature: boolean;
  payloadShapeValid: boolean;
};

export type ApprovalValidationFailureCode =
  | "NO_APPROVALS"
  | "APPROVAL_SIGNER_MISSING"
  | "APPROVAL_SIGNATURE_MISSING"
  | "APPROVAL_SIGNER_MISMATCH"
  | "APPROVAL_SHAPE_UNSUPPORTED";

export type ApprovalFormat = "hex" | "tagged" | "unknown";
export type SignatureFormat = "bytes" | "hex" | "unknown";

export type SignedTransactionApprovalDiagnostic = {
  approvalCount: number;
  approvalKeys: string[];
  signerPresent: boolean;
  signaturePresent: boolean;
  signerMatchesInitiator: boolean;
  signerMatchesConnectedAccount: boolean | null;
  signerFormat: ApprovalFormat;
  signatureFormat: SignatureFormat;
  signerFieldName: string | null;
  signatureFieldName: string | null;
  transactionInitiatorFormat: ApprovalFormat;
  failureCode?: ApprovalValidationFailureCode;
};

export type SignedTransactionApprovalRecord = {
  signer: unknown;
  signature: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export function unwrapSignedTransactionV1Json(value: unknown) {
  const record = asRecord(value);
  const wrapped = asRecord(record?.Version1);
  if (wrapped?.payload) {
    return {
      transaction: wrapped,
      transactionVariant: "TransactionV1" as const,
      approvalContainerPath: Array.isArray(wrapped.approvals)
        ? "Version1.approvals"
        : null,
    };
  }
  if (record?.payload) {
    return {
      transaction: record,
      transactionVariant: "TransactionV1" as const,
      approvalContainerPath: Array.isArray(record.approvals)
        ? "approvals"
        : null,
    };
  }
  return {
    transaction: record,
    transactionVariant: "unknown" as const,
    approvalContainerPath: null,
  };
}

export function getSignedTransactionApprovalRecords(
  value: unknown,
): SignedTransactionApprovalRecord[] {
  const { transaction } = unwrapSignedTransactionV1Json(value);
  const approvals = transaction?.approvals;
  return Array.isArray(approvals)
    ? approvals.map((approval) => {
        const record = asRecord(approval);
        return {
          signer: record?.signer,
          signature: record?.signature,
        };
      })
    : [];
}

const signerFieldNames = [
  "signer",
  "publicKey",
  "public_key",
  "PublicKey",
  "accountPublicKey",
  "account_public_key",
];
const signatureFieldNames = ["signature", "signatureHex", "Signature"];

function findField(
  record: Record<string, unknown> | undefined,
  names: string[],
) {
  if (!record) return { name: null, value: undefined };
  const name = names.find((candidate) =>
    Object.prototype.hasOwnProperty.call(record, candidate),
  );
  return { name: name ?? null, value: name ? record[name] : undefined };
}

function stringAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const part of path) current = asRecord(current)?.[part];
  return typeof current === "string" ? current : undefined;
}

export function getSignerFormat(value: unknown): ApprovalFormat {
  return typeof value === "string" && canonicalizeCasperPublicKey(value)
    ? "tagged"
    : "unknown";
}

export function getSignatureFormat(value: unknown): SignatureFormat {
  if (
    value instanceof Uint8Array ||
    (Array.isArray(value) && value.every((item) => Number.isInteger(item)))
  ) {
    return "bytes";
  }
  if (typeof value === "string") {
    const normalized = value.replace(/^0x/i, "");
    if (/^[0-9a-f]+$/i.test(normalized) && normalized.length >= 128) {
      return "hex";
    }
  }
  return "unknown";
}

export function canonicalizeCasperPublicKey(input: string) {
  const withoutDisplayPrefix = input
    .trim()
    .replace(/^(public-key|hex):/i, "");
  try {
    return CasperSdk.PublicKey.fromHex(withoutDisplayPrefix)
      .toHex()
      .toLowerCase();
  } catch {
    return null;
  }
}

export function publicKeysMatch(left: unknown, right: unknown) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const normalizedLeft = canonicalizeCasperPublicKey(left);
  const normalizedRight = canonicalizeCasperPublicKey(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function getSignedTransactionApprovalDiagnostic({
  transactionJson,
  connectedPublicKey,
}: {
  transactionJson: unknown;
  connectedPublicKey?: string | null;
}): SignedTransactionApprovalDiagnostic {
  const { transaction } = unwrapSignedTransactionV1Json(transactionJson);
  const approvals = Array.isArray(transaction?.approvals)
    ? transaction.approvals
    : [];
  const approval = asRecord(approvals[0]);
  const approvalKeys = approval ? Object.keys(approval).sort() : [];
  const signerField = findField(approval, signerFieldNames);
  const signatureField = findField(approval, signatureFieldNames);
  const initiator = stringAt(transaction, ["payload", "initiator_addr", "PublicKey"]);
  const signerPresent =
    signerField.name !== null &&
    signerField.value !== null &&
    signerField.value !== undefined &&
    (typeof signerField.value !== "string" || signerField.value.length > 0);
  const signaturePresent =
    signatureField.name !== null &&
    signatureField.value !== null &&
    signatureField.value !== undefined &&
    (typeof signatureField.value !== "string" ||
      signatureField.value.length > 0);
  const signerFormat = getSignerFormat(signerField.value);
  const signatureFormat = getSignatureFormat(signatureField.value);
  const transactionInitiatorFormat = getSignerFormat(initiator);
  const signerMatchesInitiator = publicKeysMatch(signerField.value, initiator);
  const signerMatchesConnectedAccount = connectedPublicKey
    ? publicKeysMatch(signerField.value, connectedPublicKey)
    : null;

  let failureCode: ApprovalValidationFailureCode | undefined;
  if (approvals.length === 0) failureCode = "NO_APPROVALS";
  else if (!signerPresent) failureCode = "APPROVAL_SIGNER_MISSING";
  else if (!signaturePresent) failureCode = "APPROVAL_SIGNATURE_MISSING";
  else if (
    signerFormat === "unknown" ||
    signatureFormat === "unknown" ||
    transactionInitiatorFormat === "unknown"
  ) {
    failureCode = "APPROVAL_SHAPE_UNSUPPORTED";
  } else if (!signerMatchesInitiator) {
    failureCode = "APPROVAL_SIGNER_MISMATCH";
  }

  return {
    approvalCount: approvals.length,
    approvalKeys,
    signerPresent,
    signaturePresent,
    signerMatchesInitiator,
    signerMatchesConnectedAccount,
    signerFormat,
    signatureFormat,
    signerFieldName: signerField.name,
    signatureFieldName: signatureField.name,
    transactionInitiatorFormat,
    failureCode,
  };
}

export function getSignedTransactionBoundaryDiagnostic(
  value: unknown,
): SignedTransactionBoundaryDiagnostic {
  const { transaction, transactionVariant, approvalContainerPath } =
    unwrapSignedTransactionV1Json(value);
  const approvals = getSignedTransactionApprovalRecords(value);
  return {
    transactionVariant,
    approvalContainerPath,
    approvalCount: approvals.length,
    hasSigner: approvals.some((approval) => typeof approval.signer === "string"),
    hasNonEmptySignature: approvals.some(
      (approval) =>
        typeof approval.signature === "string" && approval.signature.length > 0,
    ),
    payloadShapeValid: Boolean(
      transaction?.payload &&
        asRecord(transaction.payload)?.fields &&
        typeof asRecord(transaction.payload)?.chain_name === "string",
    ),
  };
}
