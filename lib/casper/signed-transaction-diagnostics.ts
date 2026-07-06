export type SignedTransactionBoundaryDiagnostic = {
  transactionVariant: "TransactionV1" | "unknown";
  approvalContainerPath: string | null;
  approvalCount: number;
  hasSigner: boolean;
  hasNonEmptySignature: boolean;
  payloadShapeValid: boolean;
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
