import { REVIEWED_TESTNET_ANCHOR_FEE_POLICY } from "@/lib/casper/anchor-fee-policy";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-anchor-config";
import {
  getSignedTransactionApprovalDiagnostic,
  unwrapSignedTransactionV1Json,
  type SignedTransactionBoundaryDiagnostic,
  type SignedTransactionApprovalDiagnostic,
} from "@/lib/casper/signed-transaction-diagnostics";

const DEFAULT_RPC = "https://node.testnet.casper.network/rpc";

export type SubmitAnchorExpectedMetadata = {
  jobId: string;
  dossierHash: string;
  artifactRootHash: string;
  artifactCount: number;
  expectedPackageHash: string;
  expectedNetwork: string;
};

export type SubmitAnchorRelayInput = {
  signedTransaction: unknown;
  expected: SubmitAnchorExpectedMetadata;
  clientDiagnostic?: SignedTransactionBoundaryDiagnostic;
};

export type SubmitAnchorRelayResult =
  | {
      status: "submitted";
      transactionHash: string;
    }
  | {
      status: "failed";
      code: string;
      message: string;
      diagnostic?: {
        clientExpectedApprovalCount?: number;
        serverObservedApprovalCount: number;
        approvalContainerPath: string | null;
        transactionVariant: string;
        approvalCount?: number;
        signerPresent?: boolean;
        signaturePresent?: boolean;
        signerMatchesInitiator?: boolean;
        signerFormat?: string;
        signatureFormat?: string;
        failureCode?: string;
        rpcMethodUsed?: string;
        paramsContainerShape?: "array" | "object" | "unknown";
        transactionWrapperShape?: "Version1" | "raw-v1" | "sdk-instance" | "unknown";
        outgoingRequestSchemaValid?: boolean;
      };
    };

export class SubmitAnchorValidationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SubmitAnchorValidationError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
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

function booleanAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const part of path) current = asRecord(current)?.[part];
  return typeof current === "boolean" ? current : undefined;
}

function namedArgsFromTransactionJson(transaction: unknown) {
  const named = asRecord(asRecord(asRecord(transaction)?.payload)?.fields)?.args;
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

function messageForApprovalFailure(
  code: NonNullable<SignedTransactionApprovalDiagnostic["failureCode"]>,
) {
  const messages = {
    NO_APPROVALS: "Signed transaction approval is required.",
    APPROVAL_SIGNER_MISSING:
      "Signed transaction approval is missing a signer.",
    APPROVAL_SIGNATURE_MISSING:
      "Signed transaction approval is missing a signature.",
    APPROVAL_SIGNER_MISMATCH:
      "Signed transaction approval signer does not match the transaction initiator.",
    APPROVAL_SHAPE_UNSUPPORTED:
      "Signed transaction approval shape is unsupported.",
  } satisfies Record<
    NonNullable<SignedTransactionApprovalDiagnostic["failureCode"]>,
    string
  >;
  return messages[code];
}

function fail(code: string, message: string): never {
  throw new SubmitAnchorValidationError(code, message);
}

function unwrapTransactionV1(signedTransaction: unknown) {
  return unwrapSignedTransactionV1Json(signedTransaction).transaction;
}

function paramsContainerShape(value: unknown): "array" | "object" | "unknown" {
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  return "unknown";
}

function transactionWrapperShape(
  value: unknown,
): "Version1" | "raw-v1" | "sdk-instance" | "unknown" {
  const record = asRecord(value);
  if (record?.Version1) return "Version1";
  if (record?.payload && Array.isArray(record.approvals)) return "raw-v1";
  if (
    typeof asRecord(value)?.toJSON === "function" &&
    typeof asRecord(value)?.getTransactionV1 === "function"
  ) {
    return "sdk-instance";
  }
  return "unknown";
}

function exactMatch(actual: unknown, expected: unknown, code: string) {
  if (actual !== expected) {
    fail(code, "Signed transaction does not match the expected anchor payload.");
  }
}

export function validateSignedAnchorTransaction(input: SubmitAnchorRelayInput) {
  const transaction = unwrapTransactionV1(input.signedTransaction);
  const expected = input.expected;
  const args = namedArgsFromTransactionJson(transaction);

  if (!asRecord(transaction)?.payload) {
    fail("INVALID_TRANSACTION_V1", "Signed TransactionV1 JSON is required.");
  }
  exactMatch(expected.expectedNetwork, LIVE_PROOF_ANCHOR_CONFIG.chainName, "EXPECTED_NETWORK_MISMATCH");
  exactMatch(expected.expectedPackageHash, LIVE_PROOF_ANCHOR_CONFIG.packageHash, "EXPECTED_PACKAGE_HASH_MISMATCH");
  exactMatch(
    stringAt(transaction, ["payload", "chain_name"]),
    LIVE_PROOF_ANCHOR_CONFIG.chainName,
    "CHAIN_MISMATCH",
  );
  exactMatch(
    stringAt(transaction, [
      "payload",
      "fields",
      "target",
      "Stored",
      "id",
      "ByPackageHash",
      "addr",
    ]),
    LIVE_PROOF_ANCHOR_CONFIG.packageHashBytes,
    "PACKAGE_HASH_MISMATCH",
  );
  exactMatch(
    stringAt(transaction, ["payload", "fields", "target", "Stored", "runtime"]),
    LIVE_PROOF_ANCHOR_CONFIG.runtime,
    "RUNTIME_MISMATCH",
  );
  exactMatch(
    stringAt(transaction, ["payload", "fields", "entry_point", "Custom"]),
    LIVE_PROOF_ANCHOR_CONFIG.entryPoint,
    "ENTRY_POINT_MISMATCH",
  );
  exactMatch(
    bytesArg(args, "job_id"),
    expectedStringBytes(expected.jobId),
    "JOB_ID_MISMATCH",
  );
  exactMatch(
    bytesArg(args, "dossier_hash"),
    expectedStringBytes(expected.dossierHash),
    "DOSSIER_HASH_MISMATCH",
  );
  exactMatch(
    bytesArg(args, "artifact_root_hash"),
    expectedStringBytes(expected.artifactRootHash),
    "ARTIFACT_ROOT_MISMATCH",
  );
  exactMatch(
    bytesArg(args, "artifact_count"),
    expectedU32Bytes(expected.artifactCount),
    "ARTIFACT_COUNT_MISMATCH",
  );
  exactMatch(
    String(
      numberAt(transaction, [
        "payload",
        "pricing_mode",
        "PaymentLimited",
        "payment_amount",
      ]),
    ),
    REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
    "PAYMENT_BUDGET_MISMATCH",
  );
  exactMatch(
    numberAt(transaction, [
      "payload",
      "pricing_mode",
      "PaymentLimited",
      "gas_price_tolerance",
    ]),
    REVIEWED_TESTNET_ANCHOR_FEE_POLICY.gasPriceTolerance,
    "GAS_TOLERANCE_MISMATCH",
  );
  exactMatch(
    booleanAt(transaction, [
      "payload",
      "pricing_mode",
      "PaymentLimited",
      "standard_payment",
    ]),
    REVIEWED_TESTNET_ANCHOR_FEE_POLICY.standardPayment,
    "STANDARD_PAYMENT_MISMATCH",
  );
  const approvalDiagnostic = getSignedTransactionApprovalDiagnostic({
    transactionJson: transaction,
  });
  if (approvalDiagnostic.failureCode) {
    fail(
      approvalDiagnostic.failureCode,
      messageForApprovalFailure(approvalDiagnostic.failureCode),
    );
  }

  return transaction;
}

export function buildAccountPutTransactionRequest({
  id = Date.now(),
  signedTransactionV1,
}: {
  id?: number;
  signedTransactionV1: unknown;
}) {
  return {
    jsonrpc: "2.0",
    id,
    method: "account_put_transaction",
    params: [
      {
        name: "transaction",
        value: {
          Version1: signedTransactionV1,
        },
      },
    ],
  };
}

export function getAccountPutTransactionEnvelopeDiagnostic(request: unknown) {
  const record = asRecord(request);
  const params = record?.params;
  const firstParam = Array.isArray(params) ? asRecord(params[0]) : undefined;
  const value = asRecord(firstParam?.value);
  return {
    rpcMethodUsed:
      typeof record?.method === "string" ? record.method : "unknown",
    paramsContainerShape: paramsContainerShape(params),
    transactionWrapperShape: transactionWrapperShape(value),
    outgoingRequestSchemaValid:
      record?.jsonrpc === "2.0" &&
      record?.method === "account_put_transaction" &&
      Array.isArray(params) &&
      params.length === 1 &&
      firstParam?.name === "transaction" &&
      transactionWrapperShape(value) === "Version1" &&
      Boolean(asRecord(value?.Version1)?.payload),
  };
}

export function assertAccountPutTransactionEnvelope(request: unknown) {
  const diagnostic = getAccountPutTransactionEnvelopeDiagnostic(request);
  if (!diagnostic.outgoingRequestSchemaValid) {
    throw new SubmitAnchorValidationError(
      "INVALID_RPC_ENVELOPE",
      "Casper RPC transaction submission envelope is invalid.",
    );
  }
  return diagnostic;
}

function extractTransactionHash(json: unknown) {
  const hash =
    stringAt(json, ["result", "transaction_hash", "Version1"]) ||
    stringAt(json, ["result", "transaction_hash"]) ||
    stringAt(json, ["result", "transactionHash"]) ||
    stringAt(json, ["result", "transaction_hash", "Deploy"]);
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    throw new Error("Casper RPC accepted no transaction hash.");
  }
  return hash;
}

export async function relaySignedAnchorTransaction(
  input: SubmitAnchorRelayInput,
): Promise<SubmitAnchorRelayResult> {
  try {
    const transaction = validateSignedAnchorTransaction(input);
    const rpcRequest = buildAccountPutTransactionRequest({
      signedTransactionV1: transaction,
    });
    const envelopeDiagnostic =
      assertAccountPutTransactionEnvelope(rpcRequest);
    const response = await fetch(process.env.CASPER_TESTNET_RPC || DEFAULT_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpcRequest),
    });
    const json = (await response.json()) as {
      error?: { code?: number; message?: string };
      result?: unknown;
    };
    if (json.error) {
      return {
        status: "failed",
        code: "CASPER_RPC_REJECTED",
        message: json.error.message || "Casper Testnet rejected the transaction.",
        diagnostic:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                serverObservedApprovalCount:
                  getSignedTransactionApprovalDiagnostic({
                    transactionJson: transaction,
                  }).approvalCount,
                approvalContainerPath:
                  unwrapSignedTransactionV1Json(transaction).approvalContainerPath,
                transactionVariant:
                  unwrapSignedTransactionV1Json(transaction).transactionVariant,
                rpcMethodUsed: envelopeDiagnostic.rpcMethodUsed,
                paramsContainerShape: envelopeDiagnostic.paramsContainerShape,
                transactionWrapperShape:
                  envelopeDiagnostic.transactionWrapperShape,
                outgoingRequestSchemaValid:
                  envelopeDiagnostic.outgoingRequestSchemaValid,
              },
      };
    }
    return {
      status: "submitted",
      transactionHash: extractTransactionHash(json),
    };
  } catch (error) {
    if (error instanceof SubmitAnchorValidationError) {
      return {
        status: "failed",
        code: error.code,
        message: error.message,
      };
    }
    return {
      status: "failed",
      code: "CASPER_RELAY_UNAVAILABLE",
      message:
        error instanceof Error
          ? error.message
          : "Signed transaction could not be relayed.",
    };
  }
}
