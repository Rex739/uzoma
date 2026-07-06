import { REVIEWED_TESTNET_ANCHOR_FEE_POLICY } from "@/lib/casper/anchor-fee-policy";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-anchor-config";
import {
  getSignedTransactionApprovalRecords,
  unwrapSignedTransactionV1Json,
  type SignedTransactionBoundaryDiagnostic,
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

function getValidApprovalSigner(transaction: unknown) {
  return getSignedTransactionApprovalRecords(transaction)
    .map((approval) => {
      const signer = approval.signer;
      const signature = approval.signature;
      return {
        signer,
        valid:
        typeof signer === "string" &&
        /^0[12][0-9a-f]{64}$/i.test(signer) &&
        typeof signature === "string" &&
        /^[0-9a-f]{128}([0-9a-f]{2})?$/i.test(signature),
      };
    })
    .find((approval) => approval.valid)?.signer as string | undefined;
}

function fail(code: string, message: string): never {
  throw new SubmitAnchorValidationError(code, message);
}

function unwrapTransactionV1(signedTransaction: unknown) {
  return unwrapSignedTransactionV1Json(signedTransaction).transaction;
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
  const approvalSigner = getValidApprovalSigner(transaction);
  if (!approvalSigner) {
    fail("MISSING_APPROVAL", "Signed transaction approval is required.");
  }
  exactMatch(
    approvalSigner.toLowerCase(),
    stringAt(transaction, ["payload", "initiator_addr", "PublicKey"])?.toLowerCase(),
    "APPROVAL_SIGNER_MISMATCH",
  );

  return transaction;
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
    const response = await fetch(process.env.CASPER_TESTNET_RPC || DEFAULT_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "account_put_transaction",
        params: {
          transaction: {
            Version1: transaction,
          },
        },
      }),
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
