import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type Artifact = {
  key: string;
  id: string;
  type: string;
  agentId: string;
  name: string;
  accepted: boolean;
  content: string;
};

type Fixture = {
  schema: string;
  jobId: string;
  dossierHash: string;
  artifacts: Artifact[];
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  scriptDirectory,
  "../examples/demo-escrow-artifacts.json",
);

/**
 * Canonical JSON rules shared with future frontend code:
 * object keys are sorted lexicographically, array order is preserved, strings
 * use JSON escaping, and no insignificant whitespace is included.
 */
function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
const requiredKeys = [
  "implementation",
  "independent-review",
  "specification",
  "test-report",
];
const artifacts = [...fixture.artifacts].sort((left, right) =>
  left.key.localeCompare(right.key),
);

if (
  artifacts.length !== requiredKeys.length ||
  artifacts.some(
    (artifact, index) =>
      artifact.key !== requiredKeys[index] || artifact.accepted !== true,
  )
) {
  throw new Error(
    `Fixture must contain exactly four accepted artifacts: ${requiredKeys.join(", ")}`,
  );
}

const artifactHashes = artifacts.map((artifact) => ({
  key: artifact.key,
  hash: `sha256:${sha256Hex(canonicalize(artifact as unknown as JsonValue))}`,
}));
const rootInput = Buffer.concat(
  artifactHashes.map(({ hash }) => Buffer.from(hash.slice(7), "hex")),
);
const artifactRootHash = `sha256:${sha256Hex(rootInput)}`;
const summary = {
  schema: "uzoma.artifact-root.v1",
  canonicalization:
    "UTF-8 canonical JSON with lexicographically sorted object keys; artifacts sorted by key; SHA-256 root over concatenated ordered digest bytes",
  jobId: fixture.jobId,
  dossierHash: fixture.dossierHash,
  artifactCount: artifactHashes.length,
  artifacts: artifactHashes,
  artifactRootHash,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} else {
  for (const artifact of artifactHashes) {
    process.stdout.write(`${artifact.key}: ${artifact.hash}\n`);
  }
  process.stdout.write(`artifact-root: ${artifactRootHash}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
