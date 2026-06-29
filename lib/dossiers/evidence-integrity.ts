import type {
  ActivityEvent,
  BuildDossier,
  DeliveryArtifact,
  PaymentReceipt,
} from "@/lib/types";

export const DOSSIER_HASH_VERSION = "uzoma-dossier-canonical-v1" as const;
export const ARTIFACT_ROOT_HASH_VERSION =
  "uzoma-artifact-manifest-root-v1" as const;

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REQUIRED_ARTIFACT_TYPES = [
  "specification",
  "implementation",
  "test-report",
  "review-report",
] as const satisfies readonly DeliveryArtifact["type"][];

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type CanonicalArtifactEvidence = {
  id: string;
  type: DeliveryArtifact["type"];
  agentId: DeliveryArtifact["agentId"];
  name: string;
  summary: string;
  content: string;
  metadata: Record<string, JsonValue>;
  accepted: true;
  contentHash: string;
};

export type CanonicalArtifactManifest = {
  schema: "uzoma.artifact-manifest.v1";
  canonicalization: "stable-json-v1";
  artifacts: CanonicalArtifactEvidence[];
};

export type CanonicalDossierPayload = {
  schema: "uzoma.dossier-evidence.v1";
  canonicalization: "stable-json-v1";
  dossier: {
    id: string;
    jobId: string;
    finalApproval: BuildDossier["finalApproval"];
    localWorkflowStatus: BuildDossier["localWorkflowStatus"];
  };
  artifactRootHash: string;
  artifactManifest: CanonicalArtifactManifest;
  receipts: Pick<
    PaymentReceipt,
    "id" | "stageId" | "status" | "amount" | "note"
  >[];
  timeline: Pick<ActivityEvent, "type" | "title" | "description" | "agentId">[];
};

export type DossierIntegrityResult = {
  dossierHash: string;
  dossierHashVersion: typeof DOSSIER_HASH_VERSION;
  artifactRootHash: string;
  artifactRootHashVersion: typeof ARTIFACT_ROOT_HASH_VERSION;
  artifactManifest: CanonicalArtifactManifest;
  canonicalDossierPayload: CanonicalDossierPayload;
  canonicalDossierJson: string;
};

export type DossierIntegrityIssue =
  | "LOCAL_STATUS_NOT_ACCEPTED"
  | "ALREADY_ANCHORED"
  | "MISSING_REQUIRED_ARTIFACT"
  | "INDEPENDENT_REVIEW_INCOMPLETE"
  | "INVALID_DOSSIER_HASH"
  | "INVALID_ARTIFACT_ROOT_HASH"
  | "UNSUPPORTED_DOSSIER_HASH_VERSION"
  | "UNSUPPORTED_ARTIFACT_ROOT_HASH_VERSION"
  | "DOSSIER_HASH_MISMATCH"
  | "ARTIFACT_ROOT_MISMATCH";

export type DossierAnchorEligibility = {
  eligible: boolean;
  reasons: DossierIntegrityIssue[];
  messages: string[];
  recomputed?: {
    dossierHash: string;
    artifactRootHash: string;
  };
};

/**
 * Canonical evidence format notes:
 * - object keys are sorted recursively by `stableStringify`;
 * - artifact arrays are sorted by stable artifact ID;
 * - receipts are sorted by receipt ID and timeline evidence by semantic fields;
 * - timestamps, UI labels, LocalStorage event IDs, existing stored hashes,
 *   Casper proof metadata, and display-only fields are excluded;
 * - the payload includes only accepted delivery evidence required for future
 *   anchoring: final approval, required artifacts, receipt accounting, and
 *   non-transient timeline evidence.
 */
export function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function isSha256Hash(value: unknown): value is string {
  return typeof value === "string" && SHA256_HASH_PATTERN.test(value);
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable in this environment");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function asJsonMetadata(
  metadata: DeliveryArtifact["metadata"],
): Record<string, JsonValue> {
  return (metadata ?? {}) as Record<string, JsonValue>;
}

function artifactHashInput(artifact: DeliveryArtifact): JsonValue {
  return {
    id: artifact.id,
    type: artifact.type,
    agentId: artifact.agentId,
    name: artifact.name,
    summary: artifact.summary,
    content: artifact.content,
    metadata: asJsonMetadata(artifact.metadata),
    accepted: true,
  };
}

export async function createCanonicalArtifactManifest(
  artifacts: DeliveryArtifact[],
): Promise<CanonicalArtifactManifest> {
  const canonicalArtifacts = await Promise.all(
    [...artifacts]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(async (artifact) => {
        const input = artifactHashInput(artifact);
        return {
          ...(input as Omit<CanonicalArtifactEvidence, "contentHash">),
          contentHash: await sha256(stableStringify(input)),
        };
      }),
  );
  return {
    schema: "uzoma.artifact-manifest.v1",
    canonicalization: "stable-json-v1",
    artifacts: canonicalArtifacts,
  };
}

export async function computeArtifactRootHash(
  artifacts: DeliveryArtifact[],
): Promise<{
  artifactRootHash: string;
  artifactManifest: CanonicalArtifactManifest;
}> {
  const artifactManifest = await createCanonicalArtifactManifest(artifacts);
  return {
    artifactManifest,
    artifactRootHash: await sha256(stableStringify(artifactManifest)),
  };
}

function canonicalReceipts(receipts: PaymentReceipt[]) {
  return [...receipts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, stageId, status, amount, note }) => ({
      id,
      stageId,
      status,
      amount,
      note,
    }));
}

function canonicalTimeline(timeline: ActivityEvent[]) {
  return [...timeline]
    .map(({ type, title, description, agentId }) => ({
      type,
      title,
      description,
      ...(agentId ? { agentId } : {}),
    }))
    .sort((left, right) =>
      `${left.type}|${left.title}|${left.description}|${left.agentId ?? ""}`.localeCompare(
        `${right.type}|${right.title}|${right.description}|${right.agentId ?? ""}`,
      ),
    );
}

export function createCanonicalDossierPayload(
  dossier: BuildDossier,
  artifactManifest: CanonicalArtifactManifest,
  artifactRootHash: string,
): CanonicalDossierPayload {
  return {
    schema: "uzoma.dossier-evidence.v1",
    canonicalization: "stable-json-v1",
    dossier: {
      id: dossier.id,
      jobId: dossier.jobId,
      finalApproval: dossier.finalApproval,
      localWorkflowStatus: dossier.localWorkflowStatus,
    },
    artifactRootHash,
    artifactManifest,
    receipts: canonicalReceipts(dossier.receipts),
    timeline: canonicalTimeline(dossier.timeline),
  };
}

export async function computeDossierIntegrity(
  dossier: BuildDossier,
): Promise<DossierIntegrityResult> {
  const { artifactManifest, artifactRootHash } = await computeArtifactRootHash(
    dossier.artifacts,
  );
  const canonicalDossierPayload = createCanonicalDossierPayload(
    dossier,
    artifactManifest,
    artifactRootHash,
  );
  const canonicalDossierJson = stableStringify(canonicalDossierPayload);
  return {
    dossierHash: await sha256(canonicalDossierJson),
    dossierHashVersion: DOSSIER_HASH_VERSION,
    artifactRootHash,
    artifactRootHashVersion: ARTIFACT_ROOT_HASH_VERSION,
    artifactManifest,
    canonicalDossierPayload,
    canonicalDossierJson,
  };
}

export async function applyDossierIntegrity(
  dossier: BuildDossier,
): Promise<BuildDossier> {
  const integrity = await computeDossierIntegrity(dossier);
  const artifactHashes = new Map(
    integrity.artifactManifest.artifacts.map((artifact) => [
      artifact.id,
      artifact.contentHash,
    ]),
  );
  return {
    ...dossier,
    dossierHash: integrity.dossierHash,
    dossierHashVersion: integrity.dossierHashVersion,
    artifactRootHash: integrity.artifactRootHash,
    artifactRootHashVersion: integrity.artifactRootHashVersion,
    artifacts: dossier.artifacts.map((artifact) => ({
      ...artifact,
      hash: artifactHashes.get(artifact.id) ?? artifact.hash,
    })),
  };
}

export async function validateDossierIntegrity(dossier: BuildDossier) {
  const recomputed = await computeDossierIntegrity(dossier);
  const reasons: DossierIntegrityIssue[] = [];
  if (!isSha256Hash(dossier.dossierHash)) reasons.push("INVALID_DOSSIER_HASH");
  if (!isSha256Hash(dossier.artifactRootHash)) {
    reasons.push("INVALID_ARTIFACT_ROOT_HASH");
  }
  if (dossier.dossierHash !== recomputed.dossierHash) {
    reasons.push("DOSSIER_HASH_MISMATCH");
  }
  if (dossier.artifactRootHash !== recomputed.artifactRootHash) {
    reasons.push("ARTIFACT_ROOT_MISMATCH");
  }
  return {
    valid: reasons.length === 0,
    reasons,
    recomputed: {
      dossierHash: recomputed.dossierHash,
      artifactRootHash: recomputed.artifactRootHash,
    },
  };
}

function requiredArtifactReasons(
  dossier: BuildDossier,
): DossierIntegrityIssue[] {
  const present = new Set(dossier.artifacts.map((artifact) => artifact.type));
  const reasons: DossierIntegrityIssue[] = [];
  for (const required of REQUIRED_ARTIFACT_TYPES) {
    if (!present.has(required)) reasons.push("MISSING_REQUIRED_ARTIFACT");
  }
  if (!present.has("review-report")) {
    reasons.push("INDEPENDENT_REVIEW_INCOMPLETE");
  }
  return [...new Set(reasons)];
}

const issueMessages: Record<DossierIntegrityIssue, string> = {
  LOCAL_STATUS_NOT_ACCEPTED: "Local dossier status is not accepted.",
  ALREADY_ANCHORED: "This dossier already has confirmed Casper proof.",
  MISSING_REQUIRED_ARTIFACT:
    "Required accepted delivery artifacts are incomplete.",
  INDEPENDENT_REVIEW_INCOMPLETE: "Independent review evidence is not complete.",
  INVALID_DOSSIER_HASH: "Dossier hash is not a valid SHA-256 digest.",
  INVALID_ARTIFACT_ROOT_HASH: "Artifact root is not a valid SHA-256 digest.",
  UNSUPPORTED_DOSSIER_HASH_VERSION:
    "Dossier hash version is not the live-proof canonical version.",
  UNSUPPORTED_ARTIFACT_ROOT_HASH_VERSION:
    "Artifact root version is not the live-proof canonical version.",
  DOSSIER_HASH_MISMATCH:
    "Stored dossier hash does not match recomputed evidence.",
  ARTIFACT_ROOT_MISMATCH:
    "Stored artifact root does not match recomputed artifact manifest.",
};

export async function getDossierAnchorEligibility(
  dossier: BuildDossier,
): Promise<DossierAnchorEligibility> {
  const reasons: DossierIntegrityIssue[] = [];
  if (dossier.localWorkflowStatus !== "accepted") {
    reasons.push("LOCAL_STATUS_NOT_ACCEPTED");
  }
  if (dossier.casperAnchorStatus === "confirmed") {
    reasons.push("ALREADY_ANCHORED");
  }
  reasons.push(...requiredArtifactReasons(dossier));
  if (dossier.dossierHashVersion !== DOSSIER_HASH_VERSION) {
    reasons.push("UNSUPPORTED_DOSSIER_HASH_VERSION");
  }
  if (dossier.artifactRootHashVersion !== ARTIFACT_ROOT_HASH_VERSION) {
    reasons.push("UNSUPPORTED_ARTIFACT_ROOT_HASH_VERSION");
  }
  const integrity = await validateDossierIntegrity(dossier);
  reasons.push(...integrity.reasons);
  const uniqueReasons = [...new Set(reasons)];
  return {
    eligible: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    messages: uniqueReasons.map((reason) => issueMessages[reason]),
    recomputed: integrity.recomputed,
  };
}
