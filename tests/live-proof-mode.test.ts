import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getCsprLiveDeployUrl,
  isLegacyDossier,
  isValidMotesPaymentAmount,
} from "@/lib/casper/live-proof";
import {
  createCsprClickWalletClient,
  getCsprClickConfigIssue,
  getCsprClickRuntimeDiagnostics,
  supportsTransactionV1,
} from "@/lib/casper/csprclick-client";
import { LIVE_PROOF_ANCHOR_CONFIG } from "@/lib/casper/live-proof-transaction";
import { verifyAnchorReadOnly } from "@/lib/casper/verify-anchor";
import { applyDossierIntegrity } from "@/lib/dossiers/evidence-integrity";
import { artifactFor, seedState } from "@/lib/mock-data";
import type { BuildDossier } from "@/lib/types";

const originalFetch = globalThis.fetch;
const originalCSPRClickAppId = process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalCSPRClickAppId === undefined) {
    delete process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID;
  } else {
    process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID = originalCSPRClickAppId;
  }
});

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
  assert.equal(diagnostics.providerKey, "casper-wallet");
  assert.equal(diagnostics.requiredSupport, "sign-transactionv1");
  assert.equal(getCsprClickConfigIssue(), "CSPR.click app ID is not configured.");
  await assert.rejects(
    createCsprClickWalletClient(),
    /only available in the browser/,
  );
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
