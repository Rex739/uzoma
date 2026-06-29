import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import * as casperSdkModule from "casper-js-sdk";
import {
  getCsprLiveDeployUrl,
  isLegacyDossier,
  isValidMotesPaymentAmount,
} from "@/lib/casper/live-proof";
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
  checkCasperTestnetRpcBrowserReadiness,
  LIVE_PROOF_ANCHOR_CONFIG,
} from "@/lib/casper/live-proof-transaction";
import { verifyAnchorReadOnly } from "@/lib/casper/verify-anchor";
import { applyDossierIntegrity } from "@/lib/dossiers/evidence-integrity";
import { artifactFor, seedState } from "@/lib/mock-data";
import type { BuildDossier } from "@/lib/types";

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const CasperSdk = (
  "default" in casperSdkModule
    ? casperSdkModule.default
    : casperSdkModule
) as typeof casperSdkModule;

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
  assert.equal(isLegacyDossier(seedState().dossiers[0]), true);
});

test("payment amount must be deliberately supplied", () => {
  assert.equal(isValidMotesPaymentAmount(""), false);
  assert.equal(isValidMotesPaymentAmount("0"), false);
  assert.equal(isValidMotesPaymentAmount("1.5"), false);
  assert.equal(isValidMotesPaymentAmount("20_000"), false);
  assert.equal(isValidMotesPaymentAmount("20000000000"), true);
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
    () => normalizeWalletSignature({ cancelled: false, signatureHex: "not-hex" }),
    (error) =>
      error instanceof CasperWalletClientError &&
      error.code === "CASPER_WALLET_SIGNING_ERROR",
  );
});

test("signed transaction preserves package-call fields and signer", async () => {
  const key = CasperSdk.PrivateKey.generate(CasperSdk.KeyAlgorithm.ED25519);
  const unsigned = buildAnchorDossierUnsignedTransaction({
    signerPublicKey: key.publicKey.toHex(),
    jobId: "demo-escrow",
    dossierHash:
      "sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd",
    artifactRootHash:
      "sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4",
    artifactCount: 4,
    paymentAmount: "20000000000",
  });
  assertAnchorTransactionIntegrity({
    transaction: unsigned.transaction,
    expected: unsigned.payloadPreview,
  });
  const signature = await key.rawSign(unsigned.transaction.hash.toBytes());
  const signed = applyWalletSignatureToAnchorTransaction({
    transaction: unsigned.transaction,
    signature,
    signingPublicKeyHex: key.publicKey.toHex(),
    expected: unsigned.payloadPreview,
  });
  const json = signed.toJSON() as { approvals?: unknown[] };
  assert.equal(json.approvals?.length, 1);
});

test("direct browser RPC readiness distinguishes CORS/RPC blockers", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      jsonrpc: "2.0",
      result: { chainspec_name: "casper-test" },
    })) as typeof fetch;
  assert.deepEqual(
    await checkCasperTestnetRpcBrowserReadiness("https://example.test/rpc"),
    {
      chainName: "casper-test",
      corsReady: true,
    },
  );

  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await assert.rejects(
    checkCasperTestnetRpcBrowserReadiness("https://example.test/rpc"),
    /Failed to fetch/,
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
