import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import {
  getAnchorFeePolicyDetails,
  isValidAnchorFeePolicy,
  REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
} from "@/lib/casper/anchor-fee-policy";
import {
  getDossierReferenceCopy,
  getCsprLiveDeployUrl,
  isLegacyStaticDossierEvidence,
  isValidMotesPaymentAmount,
} from "@/lib/casper/live-proof";
import { getLiveAnchorActionGates } from "@/lib/casper/anchor-action-gates";
import { normalizeStoredState } from "@/components/state-provider";
import {
  CasperWalletClientError,
  connectNativeCasperWallet,
  detectNativeCasperWalletProvider,
  normalizeWalletSignature,
  signWithNativeCasperWallet,
  supportsTransactionV1,
} from "@/lib/casper/casper-wallet-client";
import {
  applyWalletSignatureToAnchorTransaction,
  assertAnchorTransactionIntegrity,
  buildAnchorDossierUnsignedTransaction,
  getSignedAnchorApprovalSummary,
  getSignedAnchorTransactionRelayJson,
  LIVE_PROOF_ANCHOR_CONFIG,
} from "@/lib/casper/live-proof-transaction";
import { verifyAnchorReadOnly } from "@/lib/casper/verify-anchor";
import { applyDossierIntegrity } from "@/lib/dossiers/evidence-integrity";
import {
  canDeleteLocalJob,
  deleteLocalJobFromState,
} from "@/lib/jobs/delete-local-job";
import { artifactFor, seedState } from "@/lib/mock-data";
import type { AppState, BuildDossier, BuildJob } from "@/lib/types";
import type { CasperWalletConnection } from "@/lib/casper/casper-wallet-client";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const testPublicKey =
  "011111111111111111111111111111111111111111111111111111111111111111";
const testSignature = Uint8Array.from({ length: 64 }, (_, index) => index);

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

function installFakeWindow(providerFactory?: () => unknown) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      CasperWalletProvider: providerFactory,
      setTimeout,
      clearTimeout,
    },
  });
}

function fakeProvider({
  requestConnection = async () => true,
  isConnected = async () => true,
  publicKey = "011111111111111111111111111111111111111111111111111111111111111111",
  supports = ["sign-transactionv1"],
  sign = async () => ({ cancelled: true as const }),
}: {
  requestConnection?: () => Promise<boolean>;
  isConnected?: () => Promise<boolean>;
  publicKey?: string;
  supports?: string[];
  sign?: (transactionJson: string, publicKeyHex: string) => Promise<unknown>;
} = {}) {
  const calls = {
    requestConnection: 0,
    isConnected: 0,
    getActivePublicKey: 0,
    getActivePublicKeySupports: 0,
    sign: 0,
  };
  return {
    calls,
    provider: {
      requestConnection: async () => {
        calls.requestConnection += 1;
        return requestConnection();
      },
      isConnected: async () => {
        calls.isConnected += 1;
        return isConnected();
      },
      getActivePublicKey: async () => {
        calls.getActivePublicKey += 1;
        return publicKey;
      },
      getActivePublicKeySupports: async () => {
        calls.getActivePublicKeySupports += 1;
        return supports;
      },
      getVersion: async () => "2.4.3-test",
      sign: async (transactionJson: string, publicKeyHex: string) => {
        calls.sign += 1;
        return sign(transactionJson, publicKeyHex);
      },
    },
  };
}

function writeU32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return [...buffer];
}

function writeU64(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return [...buffer];
}

function writeString(value: string) {
  const bytes = [...Buffer.from(value, "utf8")];
  return [...writeU32(bytes.length), ...bytes];
}

function dossierEventBytes({
  jobId,
  dossierHash,
  artifactRootHash,
  artifactCount,
}: {
  jobId: string;
  dossierHash: string;
  artifactRootHash: string;
  artifactCount: number;
}) {
  return [
    ...writeString("event_DossierAnchored"),
    ...writeU64(2),
    0,
    ...Array.from({ length: 32 }, (_, index) => index),
    ...writeString(jobId),
    ...writeString(dossierHash),
    ...writeString(artifactRootHash),
    ...writeU32(artifactCount),
    1,
    ...writeU64(1_719_139_380_000),
  ];
}

async function canonicalDossier(): Promise<BuildDossier> {
  const at = "2026-06-26T10:00:00.000Z";
  const artifacts = ["planning", "building", "testing", "reviewing"].flatMap(
    (stage) => {
      const artifact = artifactFor(stage, "live-proof-job", at);
      return artifact ? [artifact] : [];
    },
  );
  return applyDossierIntegrity({
    id: "live-proof-job",
    jobId: "live-proof-job",
    createdAt: at,
    dossierHash: "",
    finalApproval: "Approved",
    localWorkflowStatus: "accepted",
    casperAnchorStatus: "not-anchored",
    artifacts,
    timeline: [],
    receipts: [],
  });
}

function jobForDossier(dossier: BuildDossier, title = "User local job"): BuildJob {
  const job = structuredClone(seedState().jobs[0]);
  return {
    ...job,
    id: dossier.jobId,
    title,
    dossierId: dossier.id,
  };
}

function walletConnection({
  publicKey = "011111111111111111111111111111111111111111111111111111111111111111",
  supports = ["sign-transactionv1"],
}: {
  publicKey?: string;
  supports?: string[];
} = {}): CasperWalletConnection {
  const { provider } = fakeProvider({ publicKey, supports });
  return {
    provider: provider as CasperWalletConnection["provider"],
    publicKey,
    supports,
  };
}

function mockRpcForVerifiedEvent(dossier: BuildDossier) {
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    const result =
      body.method === "info_get_transaction"
        ? {
            execution_info: {
              block_hash: "anchor-block-hash",
              block_height: 8_300_001,
              execution_result: { Version1: { Success: {} } },
            },
          }
        : body.method === "query_global_state"
          ? {
              stored_value: {
                ContractPackage: {
                  versions: [{ contract_hash: "contract-abc123" }],
                },
              },
            }
          : body.method === "chain_get_state_root_hash"
            ? { state_root_hash: "state-root-hash" }
            : {
                dictionary_key: "dictionary-key",
                stored_value: {
                  CLValue: {
                    parsed: dossierEventBytes({
                      jobId: dossier.jobId,
                      dossierHash: dossier.dossierHash,
                      artifactRootHash: dossier.artifactRootHash ?? "",
                      artifactCount: dossier.artifacts.length,
                    }),
                  },
                },
              };
    return Response.json({ jsonrpc: "2.0", result });
  }) as typeof fetch;
}

test("legacy demo dossier cannot use the new live anchor action", () => {
  assert.equal(isLegacyStaticDossierEvidence(seedState().dossiers[0]), true);
});

test("dossier reference label distinguishes legacy static records from canonical hashes", async () => {
  const legacyCopy = getDossierReferenceCopy(seedState().dossiers[0]);
  const canonicalCopy = getDossierReferenceCopy(await canonicalDossier());
  assert.equal(legacyCopy.label, "LEGACY DOSSIER REFERENCE");
  assert.equal(legacyCopy.copyLabel, "Copy reference");
  assert.equal(canonicalCopy.label, "DETERMINISTIC DOSSIER HASH");
  assert.equal(canonicalCopy.copyLabel, "Copy hash");
});

test("hydrated demo escrow missing legacy versions is normalized without affecting canonical dossiers", async () => {
  const canonical = await canonicalDossier();
  const stored = seedState();
  const staleDemo = {
    ...stored.dossiers[0],
    dossierHashVersion: undefined,
    artifactRootHashVersion: undefined,
  };
  const normalized = normalizeStoredState({
    ...stored,
    dossiers: [staleDemo, canonical],
  });
  const demo = normalized.dossiers.find((dossier) => dossier.id === "demo-escrow");
  const live = normalized.dossiers.find((dossier) => dossier.id === canonical.id);
  assert.equal(demo?.dossierHashVersion, "legacy-static-v1");
  assert.equal(demo?.artifactRootHashVersion, "legacy-static-v1");
  assert.equal(
    getDossierReferenceCopy(demo!).label,
    "LEGACY DOSSIER REFERENCE",
  );
  assert.equal(getDossierReferenceCopy(demo!).copyLabel, "Copy reference");
  assert.equal(isLegacyStaticDossierEvidence(live!), false);
  assert.equal(
    getDossierReferenceCopy(live!).label,
    "DETERMINISTIC DOSSIER HASH",
  );
  assert.equal(getDossierReferenceCopy(live!).copyLabel, "Copy hash");
});

test("normal user-created local job can be deleted without network access", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("network should not be used");
  }) as typeof fetch;
  const dossier = await canonicalDossier();
  const job = jobForDossier(dossier, "Verified Construction Milestone Escrow");
  const state: AppState = {
    ...seedState(),
    jobs: [job, ...seedState().jobs],
    dossiers: [dossier, ...seedState().dossiers],
    events: [
      {
        id: "evt-local-delete-test",
        jobId: job.id,
        type: "job.created",
        title: "Build request created",
        description: "Local job entered the workflow.",
        timestamp: job.createdAt,
      },
      ...seedState().events,
    ],
  };
  assert.equal(canDeleteLocalJob(job, state.dossiers), true);
  const result = deleteLocalJobFromState(state, job.id);
  assert.equal(result.deleted, true);
  assert.equal(result.state.jobs.some((item) => item.id === job.id), false);
  assert.equal(
    result.state.dossiers.some((item) => item.jobId === job.id),
    false,
  );
  assert.equal(result.state.events.some((item) => item.jobId === job.id), false);
  assert.equal(
    result.state.jobs.some((item) => item.id === "demo-escrow"),
    true,
  );
  assert.equal(fetchCalls, 0);
});

test("demo escrow and confirmed anchor records cannot be deleted", async () => {
  const seeded = seedState();
  assert.equal(canDeleteLocalJob(seeded.jobs[0], seeded.dossiers), false);
  assert.equal(deleteLocalJobFromState(seeded, "demo-escrow").deleted, false);

  const dossier = {
    ...(await canonicalDossier()),
    casperAnchorStatus: "confirmed" as const,
  };
  const job = jobForDossier(dossier, "Confirmed local anchor");
  const state: AppState = {
    ...seeded,
    jobs: [job, ...seeded.jobs],
    dossiers: [dossier, ...seeded.dossiers],
  };
  assert.equal(canDeleteLocalJob(job, state.dossiers), false);
  const result = deleteLocalJobFromState(state, job.id);
  assert.equal(result.deleted, false);
  assert.equal(result.state.jobs.some((item) => item.id === job.id), true);
});

test("deleting one local job preserves other local jobs and canonical evidence rules", async () => {
  const first = await canonicalDossier();
  const second = {
    ...(await canonicalDossier()),
    id: "other-local-job",
    jobId: "other-local-job",
  };
  const firstJob = jobForDossier(first, "Delete me");
  const secondJob = jobForDossier(second, "Keep me");
  const state: AppState = {
    ...seedState(),
    jobs: [firstJob, secondJob, ...seedState().jobs],
    dossiers: [first, second, ...seedState().dossiers],
  };
  assert.equal(canDeleteLocalJob(firstJob, state.dossiers), true);
  assert.equal(canDeleteLocalJob(secondJob, state.dossiers), true);
  const result = deleteLocalJobFromState(state, firstJob.id);
  assert.equal(result.deleted, true);
  assert.equal(result.state.jobs.some((item) => item.id === firstJob.id), false);
  assert.equal(result.state.jobs.some((item) => item.id === secondJob.id), true);
  assert.equal(
    result.state.dossiers.some((item) => item.id === second.id),
    true,
  );
  assert.equal(isLegacyStaticDossierEvidence(second), false);
});

test("payment amount must be deliberately supplied", () => {
  assert.equal(isValidMotesPaymentAmount(""), false);
  assert.equal(isValidMotesPaymentAmount("0"), false);
  assert.equal(isValidMotesPaymentAmount("1.5"), false);
  assert.equal(isValidMotesPaymentAmount("20_000"), false);
  assert.equal(isValidMotesPaymentAmount("20000000000"), true);
});

test("live anchor modal gates hide wallet review until policy and wallet are ready", () => {
  const missingPolicy = getLiveAnchorActionGates({
    paymentPolicyValid: false,
    connection: null,
    eligibilityReady: true,
    anchorEligible: true,
    unsignedTransactionReady: false,
    state: "reviewing",
  });
  assert.equal(missingPolicy.connectEnabled, false);
  assert.equal(missingPolicy.reviewVisible, false);
  assert.equal(missingPolicy.reviewEnabled, false);

  const validPolicyDisconnected = getLiveAnchorActionGates({
    paymentPolicyValid: true,
    connection: null,
    eligibilityReady: true,
    anchorEligible: true,
    unsignedTransactionReady: false,
    state: "reviewing",
  });
  assert.equal(validPolicyDisconnected.connectEnabled, true);
  assert.equal(validPolicyDisconnected.reviewVisible, false);
  assert.equal(validPolicyDisconnected.reviewEnabled, false);
});

test("live anchor modal keeps review unavailable without TransactionV1 capability", () => {
  const gates = getLiveAnchorActionGates({
    paymentPolicyValid: true,
    connection: walletConnection({ supports: [] }),
    eligibilityReady: true,
    anchorEligible: true,
    unsignedTransactionReady: true,
    state: "wallet-connected",
  });
  assert.equal(gates.walletConnected, true);
  assert.equal(gates.transactionV1Supported, false);
  assert.equal(gates.connectEnabled, false);
  assert.equal(gates.reviewVisible, true);
  assert.equal(gates.reviewEnabled, false);
});

test("live anchor modal enables review only when all signing prerequisites are met", () => {
  const gates = getLiveAnchorActionGates({
    paymentPolicyValid: true,
    connection: walletConnection(),
    eligibilityReady: true,
    anchorEligible: true,
    unsignedTransactionReady: true,
    state: "wallet-connected",
  });
  assert.equal(gates.connectEnabled, false);
  assert.equal(gates.reviewVisible, true);
  assert.equal(gates.reviewEnabled, true);
});

test("live anchor modal busy or signed states block wallet review and submission triggers", () => {
  for (const state of [
    "awaiting-wallet-approval",
    "submitting",
    "submitted",
    "verifying",
    "confirmed",
    "signed",
  ] as const) {
    const gates = getLiveAnchorActionGates({
      paymentPolicyValid: true,
      connection: walletConnection(),
      eligibilityReady: true,
      anchorEligible: true,
      unsignedTransactionReady: true,
      state,
    });
    assert.equal(gates.connectEnabled, false);
    assert.equal(gates.reviewEnabled, false);
  }
});

test("live anchor modal uses a reviewed payment policy instead of an editable mote input", () => {
  const source = fs.readFileSync("components/dossier-anchor-action.tsx", "utf8");
  assert.equal(source.includes("Enter deliberate Testnet payment amount"), false);
  assert.equal(source.includes("Required payment amount, in motes"), false);
  assert.equal(source.includes("inputMode=\"numeric\""), false);
  assert.equal(source.includes("Payment source"), false);
  assert.equal(source.includes("PAYMENT SOURCE"), false);
  assert.equal(source.includes("previous dossier"), false);
  assert.equal(source.includes("old demo"), false);
  assert.equal(source.includes("prior successful anchor transaction"), false);
  assert.equal(source.includes("Casper Testnet execution budget"), true);
  assert.equal(source.includes("View technical policy details"), true);
  assert.equal(
    source.includes(REVIEWED_TESTNET_ANCHOR_FEE_POLICY.sourceTransactionHash),
    false,
  );
  assert.equal(
    source.includes("REVIEWED_TESTNET_ANCHOR_FEE_POLICY.sourceTransactionHash"),
    true,
  );
  assert.equal(isValidAnchorFeePolicy(REVIEWED_TESTNET_ANCHOR_FEE_POLICY), true);
  assert.deepEqual(
    getAnchorFeePolicyDetails({
      expanded: false,
      policy: REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
    }),
    [],
  );
  assert.equal(
    getAnchorFeePolicyDetails({
      expanded: true,
      policy: REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
    }).some(
      (detail) =>
        detail.label === "Reference transaction" &&
        detail.value === REVIEWED_TESTNET_ANCHOR_FEE_POLICY.sourceTransactionHash,
    ),
    true,
  );
  assert.equal(
    isValidAnchorFeePolicy({
      ...REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
      paymentAmountMotes: "0",
    }),
    false,
  );
  assert.equal(
    isValidAnchorFeePolicy({
      ...REVIEWED_TESTNET_ANCHOR_FEE_POLICY,
      network: "casper-mainnet",
    }),
    false,
  );
  assert.equal(
    REVIEWED_TESTNET_ANCHOR_FEE_POLICY.sourceTransactionHash,
    "770848c2ac6d2ef68133e03b7e567f2dec4bb255f34b9c79128174e5e2527658",
  );
});

test("native Casper Wallet detection is SSR-safe and does not connect", async () => {
  await assert.rejects(
    detectNativeCasperWalletProvider({ timeoutMs: 0 }),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_PROVIDER_UNSUPPORTED",
  );
});

test("extension initially absent then available within retry window", async () => {
  const { provider, calls } = fakeProvider();
  let available = false;
  installFakeWindow(() => (available ? provider : undefined));
  setTimeout(() => {
    available = true;
  }, 20);
  const detected = await detectNativeCasperWalletProvider({
    timeoutMs: 200,
    intervalMs: 10,
  });
  assert.equal(detected, provider);
  assert.equal(calls.requestConnection, 0);
  assert.equal(calls.sign, 0);
});

test("wallet unavailable and unsupported provider shape are recoverable", async () => {
  installFakeWindow();
  await assert.rejects(
    detectNativeCasperWalletProvider({ timeoutMs: 0 }),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_NOT_INSTALLED",
  );
  installFakeWindow(() => ({ requestConnection: async () => true }));
  await assert.rejects(
    detectNativeCasperWalletProvider({ timeoutMs: 0 }),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_PROVIDER_UNSUPPORTED",
  );
});

test("locked wallet, declined connection, and missing active key are explicit", async () => {
  installFakeWindow(() =>
    fakeProvider({
      requestConnection: async () => {
        throw new Error("Wallet locked");
      },
    }).provider,
  );
  await assert.rejects(
    connectNativeCasperWallet(),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_LOCKED",
  );

  installFakeWindow(() =>
    fakeProvider({ requestConnection: async () => false }).provider,
  );
  await assert.rejects(
    connectNativeCasperWallet(),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_CONNECTION_DECLINED",
  );

  installFakeWindow(() => fakeProvider({ publicKey: "" }).provider);
  await assert.rejects(
    connectNativeCasperWallet(),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_NO_ACTIVE_ACCOUNT",
  );
});

test("successful connection requires sign-transactionv1 support", async () => {
  installFakeWindow(() => fakeProvider({ supports: ["sign-deploy"] }).provider);
  await assert.rejects(
    connectNativeCasperWallet(),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_TRANSACTION_V1_UNSUPPORTED",
  );

  const { provider, calls } = fakeProvider();
  installFakeWindow(() => provider);
  const connection = await connectNativeCasperWallet();
  assert.equal(connection.publicKey.startsWith("01"), true);
  assert.equal(supportsTransactionV1(connection.supports), true);
  assert.equal(calls.requestConnection, 1);
  assert.equal(calls.sign, 0);
});

test("no sign request occurs before explicit sign call", async () => {
  const { provider, calls } = fakeProvider();
  installFakeWindow(() => provider);
  await connectNativeCasperWallet();
  assert.equal(calls.sign, 0);
});

test("signing cancellation does not become failure", async () => {
  const { provider } = fakeProvider({
    sign: async () => ({ cancelled: true, message: "User cancelled" }),
  });
  await assert.rejects(
    signWithNativeCasperWallet({
      provider: provider as never,
      transactionJson: "{}",
      signingPublicKeyHex: "01abc",
    }),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_SIGNING_CANCELLED",
  );
});

test("malformed signature blocks submission", () => {
  assert.throws(
    () =>
      normalizeWalletSignature({
        cancelled: false,
        signatureHex: "a".repeat(128),
        signature: [],
      }),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_SIGNING_ERROR",
  );
  assert.throws(
    () =>
      normalizeWalletSignature({
        cancelled: false,
        signatureHex: "a".repeat(128),
      }),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_SIGNING_ERROR",
  );
});

test("wallet response normalization uses official Casper Wallet signature bytes", () => {
  const signature = Uint8Array.from({ length: 64 }, (_, index) => index);
  const normalized = normalizeWalletSignature({
    cancelled: false,
    signatureHex: "f".repeat(128),
    signature,
  });

  assert.deepEqual([...normalized], [...signature]);
});

test("signed transaction preserves package-call fields and signer", () => {
  const unsigned = buildAnchorDossierUnsignedTransaction({
    signerPublicKey: testPublicKey,
    jobId: "demo-escrow",
    dossierHash:
      "sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd",
    artifactRootHash:
      "sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4",
    artifactCount: 4,
    paymentAmount: REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
  });
  assertAnchorTransactionIntegrity({
    transaction: unsigned.transaction,
    expected: unsigned.payloadPreview,
  });
  const signed = applyWalletSignatureToAnchorTransaction({
    transaction: unsigned.transaction,
    signatureResponse: {
      cancelled: false,
      signatureHex: "0".repeat(128),
      signature: testSignature,
    },
    signingPublicKeyHex: testPublicKey,
    expected: unsigned.payloadPreview,
  });
  const json = signed.toJSON() as { approvals?: unknown[] };
  assert.equal(json.approvals?.length, 1);
  assert.deepEqual(
    getSignedAnchorApprovalSummary({
      transactionJson: json,
      expectedSignerPublicKey: testPublicKey,
    }),
    {
      approvalCount: 1,
      signerMatches: true,
      signaturePresent: true,
    },
  );
  assert.deepEqual(
    getSignedAnchorTransactionRelayJson({
      transaction: signed,
      expectedSignerPublicKey: testPublicKey,
    }),
    json,
  );
});

test("client blocks relay serialization when approval count is zero", () => {
  const unsigned = buildAnchorDossierUnsignedTransaction({
    signerPublicKey:
      "011111111111111111111111111111111111111111111111111111111111111111",
    jobId: "demo-escrow",
    dossierHash:
      "sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd",
    artifactRootHash:
      "sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4",
    artifactCount: 4,
    paymentAmount: REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
  });

  assert.throws(
    () =>
      getSignedAnchorTransactionRelayJson({
        transaction: unsigned.transaction,
        expectedSignerPublicKey: unsigned.payloadPreview.signerPublicKey,
      }),
    /Wallet approval could not be attached/,
  );
});

test("official signature application returns the signed transaction used for relay", () => {
  const unsigned = buildAnchorDossierUnsignedTransaction({
    signerPublicKey: testPublicKey,
    jobId: "demo-escrow",
    dossierHash:
      "sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd",
    artifactRootHash:
      "sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4",
    artifactCount: 4,
    paymentAmount: REVIEWED_TESTNET_ANCHOR_FEE_POLICY.paymentAmountMotes,
  });
  const unsignedJsonBeforeSigning = unsigned.transaction.toJSON() as {
    approvals?: unknown[];
  };

  const signed = applyWalletSignatureToAnchorTransaction({
    transaction: unsigned.transaction,
    signatureResponse: {
      cancelled: false,
      signatureHex: "0".repeat(128),
      signature: testSignature,
    },
    signingPublicKeyHex: testPublicKey,
    expected: unsigned.payloadPreview,
  });
  const json = signed.toJSON() as { approvals?: unknown[] };

  assert.equal(unsignedJsonBeforeSigning.approvals?.length, 0);
  assert.equal(json.approvals?.length, 1);
  assert.deepEqual(
    getSignedAnchorApprovalSummary({
      transactionJson: json,
      expectedSignerPublicKey: testPublicKey,
    }),
    {
      approvalCount: 1,
      signerMatches: true,
      signaturePresent: true,
    },
  );
});

test("no CSPR.click runtime, dependency, or environment configuration remains", () => {
  const packageJson = fs.readFileSync("package.json", "utf8");
  const envExample = fs.readFileSync(".env.example", "utf8");
  assert.equal(packageJson.includes("csprclick"), false);
  assert.equal(envExample.includes("CSPRCLICK"), false);
  assert.equal(fs.existsSync("lib/casper/csprclick-client.ts"), false);
  assert.equal(fs.existsSync("components/live-proof-diagnostics.tsx"), false);
});

test("CSPR.live link is deterministic and only needs a confirmed hash", () => {
  assert.equal(
    getCsprLiveDeployUrl("abc"),
    "https://testnet.cspr.live/deploy/abc",
  );
});

test("read-only verifier confirms only a matching on-chain event", async () => {
  const dossier = await canonicalDossier();
  mockRpcForVerifiedEvent(dossier);
  const result = await verifyAnchorReadOnly({
    transactionHash: "tx-hash",
    expectedJobId: dossier.jobId,
    expectedDossierHash: dossier.dossierHash,
    expectedArtifactRootHash: dossier.artifactRootHash ?? "",
    expectedArtifactCount: dossier.artifacts.length,
    expectedPackageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
  });
  assert.equal(result.status, "confirmed");
  if (result.status === "confirmed") {
    assert.equal(result.proof.onChainRecord.jobId, dossier.jobId);
    assert.equal(result.proof.onChainRecord.accepted, true);
    assert.equal(result.proof.browserLocal, true);
  }
});

test("read-only verifier refuses mismatched expected evidence", async () => {
  const dossier = await canonicalDossier();
  mockRpcForVerifiedEvent(dossier);
  const result = await verifyAnchorReadOnly({
    transactionHash: "tx-hash",
    expectedJobId: dossier.jobId,
    expectedDossierHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    expectedArtifactRootHash: dossier.artifactRootHash ?? "",
    expectedArtifactCount: dossier.artifacts.length,
    expectedPackageHash: LIVE_PROOF_ANCHOR_CONFIG.packageHash,
  });
  assert.equal(result.status, "unverified");
});
