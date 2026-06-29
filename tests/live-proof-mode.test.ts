import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, test } from "node:test";
import {
  getCsprLiveDeployUrl,
  isLegacyDossier,
  isValidMotesPaymentAmount,
} from "@/lib/casper/live-proof";
import {
  CSPRCLICK_RUNTIME_LOADER_STRATEGY,
  CSPRCLICK_RUNTIME_VERSION,
  checkCsprClickRuntimeApi,
  getCsprClickConfigIssue,
  getLoadedCsprClickRuntime,
  getCsprClickRuntimeDiagnostics,
  getCsprClickRuntimeStatus,
  inspectProviderAvailability,
  inspectTransactionV1Capability,
  loadCsprClickRuntime,
  supportsTransactionV1,
} from "@/lib/casper/csprclick-client";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-transaction";
import { verifyAnchorReadOnly } from "@/lib/casper/verify-anchor";
import { applyDossierIntegrity } from "@/lib/dossiers/evidence-integrity";
import { artifactFor, seedState } from "@/lib/mock-data";
import type { BuildDossier } from "@/lib/types";

const originalFetch = globalThis.fetch;
const originalCSPRClickAppId = process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalCSPRClickAppId === undefined) {
    delete process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID;
  } else {
    process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID = originalCSPRClickAppId;
  }
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

function installFakeWindow(csprclick?: Record<string, unknown>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      csprclick,
      setTimeout,
      clearTimeout,
      document: {
        getElementById: () => null,
        getElementsByTagName: () => [
          {
            parentNode: {
              insertBefore: () => undefined,
            },
          },
        ],
        createElement: () => ({
          set id(_value: string) {},
          set src(_value: string) {},
          set async(_value: boolean) {},
          set onerror(_value: () => void) {},
          set onload(_value: () => void) {},
        }),
      },
    },
  });
}

function fakeSdk({
  present = true,
  supports = ["sign-transactionv1"],
}: {
  present?: boolean;
  supports?: string[];
} = {}) {
  const calls = {
    init: 0,
    isProviderPresent: 0,
    getProviderInfo: 0,
    connect: 0,
    send: 0,
    sign: 0,
  };
  return {
    calls,
    sdk: {
      init: () => {
        calls.init += 1;
      },
      once: () => undefined,
      isProviderPresent: () => {
        calls.isProviderPresent += 1;
        return present;
      },
      getProviderInfo: async () => {
        calls.getProviderInfo += 1;
        return {
          key: "casper-wallet",
          name: "Casper Wallet",
          version: "mock",
          supports,
        };
      },
      connect: async () => {
        calls.connect += 1;
        return undefined;
      },
      send: async () => {
        calls.send += 1;
        return undefined;
      },
      sign: async () => {
        calls.sign += 1;
        return undefined;
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

test("CSPR.click diagnostics are SSR-safe and do not initialize a wallet", async () => {
  delete process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID;
  const diagnostics = getCsprClickRuntimeDiagnostics();
  assert.equal(diagnostics.configured, false);
  assert.equal(diagnostics.browserRuntime, false);
  assert.equal(diagnostics.globalClientPresent, false);
  assert.equal(diagnostics.runtimeVersion, CSPRCLICK_RUNTIME_VERSION);
  assert.equal(diagnostics.loaderStrategy, CSPRCLICK_RUNTIME_LOADER_STRATEGY);
  assert.equal(diagnostics.providerKey, "casper-wallet");
  assert.equal(diagnostics.requiredSupport, "sign-transactionv1");
  assert.equal(getCsprClickConfigIssue(), "CSPR.click app ID is not configured.");
  await assert.rejects(
    loadCsprClickRuntime(),
    /immutable runtime URL/i,
  );
});

test("absent browser runtime is reported without loading a wallet", () => {
  process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID = "test-app";
  installFakeWindow();
  const diagnostics = getCsprClickRuntimeDiagnostics();
  assert.equal(diagnostics.browserRuntime, true);
  assert.equal(diagnostics.globalClientPresent, false);
  assert.equal(diagnostics.apiCheck.compatible, false);
  assert.equal(getCsprClickRuntimeStatus(), "runtime-loader-blocked");
});

test("missing app ID remains recoverable even in a browser context", async () => {
  delete process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID;
  installFakeWindow();
  assert.equal(getCsprClickRuntimeStatus(), "app-id-missing");
  await assert.rejects(loadCsprClickRuntime(), /immutable runtime URL/i);
});

test("runtime API guard distinguishes unsupported and compatible shapes", () => {
  assert.deepEqual(checkCsprClickRuntimeApi(undefined).missingMethods, [
    "init",
    "isProviderPresent",
    "getProviderInfo",
    "connect",
    "send",
  ]);
  const { sdk } = fakeSdk();
  const check = checkCsprClickRuntimeApi(sdk);
  assert.equal(check.compatible, true);
  assert.deepEqual(check.missingMethods, []);
});

test("loaded runtime can be inspected without connect, sign, or send", async () => {
  process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID = "test-app";
  const { sdk, calls } = fakeSdk({ present: true });
  installFakeWindow(sdk);
  const loaded = getLoadedCsprClickRuntime();
  assert.ok(loaded);
  assert.equal(getCsprClickRuntimeStatus(), "runtime-api-compatible");
  assert.equal(inspectProviderAvailability(loaded), "available");
  assert.equal(await inspectTransactionV1Capability(loaded), "supported");
  assert.equal(calls.connect, 0);
  assert.equal(calls.send, 0);
  assert.equal(calls.sign, 0);
});

test("provider absence is detected without connect", () => {
  process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID = "test-app";
  const { sdk, calls } = fakeSdk({ present: false });
  installFakeWindow(sdk);
  const loaded = getLoadedCsprClickRuntime();
  assert.ok(loaded);
  assert.equal(inspectProviderAvailability(loaded), "unavailable");
  assert.equal(getCsprClickRuntimeStatus(), "provider-unavailable");
  assert.equal(calls.connect, 0);
  assert.equal(calls.send, 0);
  assert.equal(calls.sign, 0);
});

test("provider metadata can report TransactionV1 as unknown or unsupported", async () => {
  const unsupported = fakeSdk({ supports: ["sign-deploy"] });
  assert.equal(
    await inspectTransactionV1Capability(unsupported.sdk as never),
    "unsupported",
  );
  const missingInfo = {
    ...unsupported.sdk,
    getProviderInfo: async () => undefined,
  };
  assert.equal(
    await inspectTransactionV1Capability(missingInfo as never),
    "unknown",
  );
  assert.equal(unsupported.calls.connect, 0);
  assert.equal(unsupported.calls.send, 0);
  assert.equal(unsupported.calls.sign, 0);
});

test("internal diagnostics route has a production-neutral safeguard", () => {
  const source = fs.readFileSync(
    "app/internal/live-proof-diagnostics/page.tsx",
    "utf8",
  );
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.match(source, /Live proof diagnostics unavailable/);
});

test("TransactionV1 capability check uses the CSPR.click provider support string", () => {
  assert.equal(
    supportsTransactionV1({
      provider: "casper-wallet",
      providerSupports: ["sign-transactionv1"],
      public_key: "01abc",
      connected_at: 0,
      name: null,
      token: null,
      custom: {},
    }),
    true,
  );
  assert.equal(
    supportsTransactionV1({
      provider: "casper-wallet",
      providerSupports: ["sign-deploy"],
      public_key: "01abc",
      connected_at: 0,
      name: null,
      token: null,
      custom: {},
    }),
    false,
  );
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
