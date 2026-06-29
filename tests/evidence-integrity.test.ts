import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDossierIntegrity,
  computeArtifactRootHash,
  computeDossierIntegrity,
  getDossierAnchorEligibility,
  isSha256Hash,
  validateDossierIntegrity,
} from "../lib/dossiers/evidence-integrity";
import type { BuildDossier, DeliveryArtifact } from "../lib/types";

const hashPattern = /^sha256:[0-9a-f]{64}$/;

const baseArtifacts: DeliveryArtifact[] = [
  {
    id: "job-planning-artifact",
    type: "specification",
    name: "Specification",
    summary: "Approved requirements and acceptance criteria.",
    content: "Roles, states, invariants, and implementation boundaries.",
    hash: "sha256:placeholder-spec",
    createdAt: "2026-06-24T10:00:00.000Z",
    agentId: "axiom",
    metadata: { version: "1.0", criteria: ["roles", "states"] },
  },
  {
    id: "job-building-artifact",
    type: "implementation",
    name: "Implementation",
    summary: "Reviewable contract implementation artifact.",
    content: "contract source code",
    hash: "sha256:placeholder-build",
    createdAt: "2026-06-24T10:05:00.000Z",
    agentId: "forge",
  },
  {
    id: "job-testing-artifact",
    type: "test-report",
    name: "Test report",
    summary: "Success paths, failure paths, and coverage evidence.",
    content: "PASS success\nPASS failure\nCOVERAGE 94%",
    hash: "sha256:placeholder-test",
    createdAt: "2026-06-24T10:10:00.000Z",
    agentId: "sentinel",
  },
  {
    id: "job-reviewing-artifact",
    type: "review-report",
    name: "Independent review",
    summary: "Approved independent evidence review.",
    content: "APPROVED all acceptance criteria",
    hash: "sha256:placeholder-review",
    createdAt: "2026-06-24T10:15:00.000Z",
    agentId: "verity",
  },
];

function sampleDossier(overrides: Partial<BuildDossier> = {}): BuildDossier {
  return {
    id: "sample-dossier",
    jobId: "sample-job",
    createdAt: "2026-06-24T10:20:00.000Z",
    dossierHash: "",
    finalApproval: "Approved",
    localWorkflowStatus: "accepted",
    casperAnchorStatus: "not-anchored",
    artifacts: structuredClone(baseArtifacts),
    receipts: [
      {
        id: "receipt-2",
        stageId: "job-building-artifact",
        status: "mock",
        amount: "$64.00",
        note: "Mock delivery receipt — no payment executed",
      },
      {
        id: "receipt-1",
        stageId: "job-planning-artifact",
        status: "mock",
        amount: "$18.00",
        note: "Mock delivery receipt — no payment executed",
      },
    ],
    timeline: [
      {
        id: "evt-random-b",
        jobId: "sample-job",
        type: "artifact.submitted",
        title: "Implementation submitted",
        description: "Forge submitted implementation evidence.",
        timestamp: "2026-06-24T10:05:00.000Z",
        agentId: "forge",
      },
      {
        id: "evt-random-a",
        jobId: "sample-job",
        type: "review.approved",
        title: "Independent review approved",
        description: "Verity approved evidence.",
        timestamp: "2026-06-24T10:15:00.000Z",
        agentId: "verity",
      },
    ],
    ...overrides,
  };
}

test("same logical dossier with different object key order produces the same dossier hash", async () => {
  const first = await applyDossierIntegrity(sampleDossier());
  const reordered = await applyDossierIntegrity({
    ...sampleDossier(),
    timeline: [...sampleDossier().timeline].reverse(),
    receipts: [...sampleDossier().receipts].reverse(),
    artifacts: sampleDossier().artifacts.map((artifact) => ({
      content: artifact.content,
      summary: artifact.summary,
      id: artifact.id,
      type: artifact.type,
      name: artifact.name,
      hash: artifact.hash,
      createdAt: artifact.createdAt,
      agentId: artifact.agentId,
      metadata: artifact.metadata,
    })),
  });

  assert.equal(first.dossierHash, reordered.dossierHash);
  assert.equal(first.artifactRootHash, reordered.artifactRootHash);
});

test("same artifact set in different input order produces the same artifact root", async () => {
  const first = await computeArtifactRootHash(baseArtifacts);
  const second = await computeArtifactRootHash([...baseArtifacts].reverse());

  assert.equal(first.artifactRootHash, second.artifactRootHash);
});

test("artifact content change alters the artifact root and creates integrity mismatch", async () => {
  const original = await applyDossierIntegrity(sampleDossier());
  const alteredArtifactFixture: BuildDossier = {
    ...original,
    artifacts: original.artifacts.map((artifact) =>
      artifact.type === "implementation"
        ? { ...artifact, content: `${artifact.content}\n// altered` }
        : artifact,
    ),
  };
  const alteredRoot = await computeArtifactRootHash(
    alteredArtifactFixture.artifacts,
  );
  const validation = await validateDossierIntegrity(alteredArtifactFixture);
  const eligibility = await getDossierAnchorEligibility(alteredArtifactFixture);

  assert.notEqual(original.artifactRootHash, alteredRoot.artifactRootHash);
  assert.equal(validation.valid, false);
  assert.ok(validation.reasons.includes("ARTIFACT_ROOT_MISMATCH"));
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes("ARTIFACT_ROOT_MISMATCH"));
});

test("same accepted dossier across repeated calls produces stable hashes", async () => {
  const first = await applyDossierIntegrity(sampleDossier());
  const second = await applyDossierIntegrity(sampleDossier());

  assert.equal(first.dossierHash, second.dossierHash);
  assert.equal(first.artifactRootHash, second.artifactRootHash);
  assert.match(first.dossierHash, hashPattern);
  assert.match(first.artifactRootHash!, hashPattern);
});

test("generated canonical payload and hashes are reproducible and valid", async () => {
  const dossier = await applyDossierIntegrity(sampleDossier());
  const integrity = await computeDossierIntegrity(dossier);
  const eligibility = await getDossierAnchorEligibility(dossier);

  assert.equal(isSha256Hash(dossier.dossierHash), true);
  assert.equal(isSha256Hash(dossier.artifactRootHash), true);
  assert.equal(dossier.dossierHash, integrity.dossierHash);
  assert.equal(dossier.artifactRootHash, integrity.artifactRootHash);
  assert.equal(eligibility.eligible, true);
});

test("placeholder and hash-like fake values fail eligibility", async () => {
  const dossier = sampleDossier({
    dossierHash: "sha256:uzoma-dossier-sample",
    artifactRootHash: "sha256:not-real",
  });
  const eligibility = await getDossierAnchorEligibility(dossier);

  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes("INVALID_DOSSIER_HASH"));
  assert.ok(eligibility.reasons.includes("INVALID_ARTIFACT_ROOT_HASH"));
});

test("incomplete dossier fails eligibility", async () => {
  const dossier = await applyDossierIntegrity(
    sampleDossier({
      artifacts: baseArtifacts.filter(
        (artifact) => artifact.type !== "test-report",
      ),
    }),
  );
  const eligibility = await getDossierAnchorEligibility(dossier);

  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes("MISSING_REQUIRED_ARTIFACT"));
});

test("missing independent review fails eligibility", async () => {
  const dossier = await applyDossierIntegrity(
    sampleDossier({
      artifacts: baseArtifacts.filter(
        (artifact) => artifact.type !== "review-report",
      ),
    }),
  );
  const eligibility = await getDossierAnchorEligibility(dossier);

  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes("INDEPENDENT_REVIEW_INCOMPLETE"));
});

test("non-accepted dossier fails eligibility", async () => {
  const dossier = await applyDossierIntegrity(
    sampleDossier({
      localWorkflowStatus: "draft" as BuildDossier["localWorkflowStatus"],
    }),
  );
  const eligibility = await getDossierAnchorEligibility(dossier);

  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes("LOCAL_STATUS_NOT_ACCEPTED"));
});

test("confirmed anchored dossier is not eligible for duplicate anchoring", async () => {
  const dossier = await applyDossierIntegrity(
    sampleDossier({ casperAnchorStatus: "confirmed" }),
  );
  const eligibility = await getDossierAnchorEligibility(dossier);

  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.includes("ALREADY_ANCHORED"));
});
