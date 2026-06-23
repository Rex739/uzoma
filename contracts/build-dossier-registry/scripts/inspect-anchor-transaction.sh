#!/usr/bin/env bash

# Builds and validates an unsigned demo dossier anchor transaction locally.
# It has no RPC or secret-key argument and never signs or broadcasts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ROOT_CALCULATOR="${SCRIPT_DIR}/compute-artifact-root.ts"
SCHEMA_PATH="${CONTRACT_DIR}/resources/casper_contract_schemas/build_dossier_registry_schema.json"
TEMP_DIR="$(mktemp -d)"
TRANSACTION_PATH="${TEMP_DIR}/unsigned-anchor.json"
trap 'rm -rf "$TEMP_DIR"' EXIT

: "${CASPER_PUBLIC_KEY:?Set CASPER_PUBLIC_KEY to the anchor account public key}"
: "${CASPER_CHAIN_NAME:?Set CASPER_CHAIN_NAME to the node-reported chain name}"
: "${CASPER_PACKAGE_HASH:?Set CASPER_PACKAGE_HASH to the verified hash-... package identifier}"
: "${CASPER_ANCHOR_PAYMENT_AMOUNT:?Set CASPER_ANCHOR_PAYMENT_AMOUNT to the deliberately reviewed anchor-call amount}"

[[ "$CASPER_PACKAGE_HASH" =~ ^hash-[0-9a-fA-F]{64}$ ]] || {
  printf 'CASPER_PACKAGE_HASH must use hash- followed by exactly 64 hexadecimal characters.\n' >&2
  exit 1
}
[[ "$CASPER_ANCHOR_PAYMENT_AMOUNT" =~ ^[1-9][0-9]*$ ]] || {
  printf 'CASPER_ANCHOR_PAYMENT_AMOUNT must be a positive integer in motes.\n' >&2
  exit 1
}
[[ -f "$SCHEMA_PATH" ]] || { printf 'Generated contract schema not found at %s\n' "$SCHEMA_PATH" >&2; exit 1; }
[[ -d "${REPO_DIR}/node_modules/tsx" ]] || { printf 'tsx runner missing; run npm install from the repository root.\n' >&2; exit 1; }

EVIDENCE="$(cd "$REPO_DIR" && node --import tsx "$ROOT_CALCULATOR" --json)"
IFS=$'\t' read -r JOB_ID DOSSIER_HASH ARTIFACT_ROOT_HASH ARTIFACT_COUNT <<< "$(printf '%s' "$EVIDENCE" | node -e '
  let data = "";
  process.stdin.on("data", chunk => data += chunk);
  process.stdin.on("end", () => {
    const evidence = JSON.parse(data);
    process.stdout.write([
      evidence.jobId,
      evidence.dossierHash,
      evidence.artifactRootHash,
      evidence.artifactCount
    ].join("\t"));
  });
')"

[[ "$JOB_ID" == "demo-escrow" && "$ARTIFACT_COUNT" == "4" ]] || {
  printf 'Unexpected deterministic demo evidence.\n' >&2
  exit 1
}

casper-client make-transaction package \
  --initiator-address "$CASPER_PUBLIC_KEY" \
  --contract-package-hash "$CASPER_PACKAGE_HASH" \
  --output "$TRANSACTION_PATH" \
  --chain-name "$CASPER_CHAIN_NAME" \
  --pricing-mode classic \
  --payment-amount "$CASPER_ANCHOR_PAYMENT_AMOUNT" \
  --standard-payment true \
  --gas-price-tolerance 1 \
  --transaction-runtime vm-casper-v1 \
  --session-entry-point anchor_dossier \
  --session-arg "job_id:string='$JOB_ID'" \
  --session-arg "dossier_hash:string='$DOSSIER_HASH'" \
  --session-arg "artifact_root_hash:string='$ARTIFACT_ROOT_HASH'" \
  --session-arg "artifact_count:u32='$ARTIFACT_COUNT'" \
  >/dev/null

TRANSACTION_PATH="$TRANSACTION_PATH" \
SCHEMA_PATH="$SCHEMA_PATH" \
EXPECTED_CHAIN="$CASPER_CHAIN_NAME" \
EXPECTED_PACKAGE_HASH="$CASPER_PACKAGE_HASH" \
EXPECTED_PAYMENT="$CASPER_ANCHOR_PAYMENT_AMOUNT" \
EXPECTED_JOB_ID="$JOB_ID" \
EXPECTED_DOSSIER_HASH="$DOSSIER_HASH" \
EXPECTED_ARTIFACT_ROOT_HASH="$ARTIFACT_ROOT_HASH" \
EXPECTED_ARTIFACT_COUNT="$ARTIFACT_COUNT" \
node -e '
  const fs = require("node:fs");
  const transaction = JSON.parse(fs.readFileSync(process.env.TRANSACTION_PATH, "utf8"));
  const schema = JSON.parse(fs.readFileSync(process.env.SCHEMA_PATH, "utf8"));
  const version = transaction.Version1;
  const payload = version?.payload;
  const pricing = payload?.pricing_mode?.PaymentLimited;
  const fields = payload?.fields;
  const stored = fields?.target?.Stored;
  const packageTarget = stored?.id?.ByPackageHash;
  const args = fields?.args?.Named;
  const namedArgs = new Map(Array.isArray(args) ? args : []);
  const endpoint = schema.entry_points?.find(item => item.name === "anchor_dossier");
  const requiredSchemaArgs = (endpoint?.arguments ?? []).filter(arg => arg.optional === false);
  const expectedPackageAddress = process.env.EXPECTED_PACKAGE_HASH.replace(/^hash-/, "").toLowerCase();
  const expectedValues = new Map([
    ["job_id", process.env.EXPECTED_JOB_ID],
    ["dossier_hash", process.env.EXPECTED_DOSSIER_HASH],
    ["artifact_root_hash", process.env.EXPECTED_ARTIFACT_ROOT_HASH],
    ["artifact_count", Number(process.env.EXPECTED_ARTIFACT_COUNT)]
  ]);
  const missingArgs = requiredSchemaArgs.filter(arg => !namedArgs.has(arg.name));
  const wrongTypes = requiredSchemaArgs.filter(arg => namedArgs.get(arg.name)?.cl_type !== arg.ty);
  const wrongValues = requiredSchemaArgs.filter(
    arg => namedArgs.get(arg.name)?.parsed !== expectedValues.get(arg.name)
  );
  const checks = {
    version: Boolean(version),
    unsigned: Array.isArray(version?.approvals) && version.approvals.length === 0,
    chain: payload?.chain_name === process.env.EXPECTED_CHAIN,
    payment: String(pricing?.payment_amount) === process.env.EXPECTED_PAYMENT,
    gasPriceTolerance: pricing?.gas_price_tolerance === 1,
    standardPayment: pricing?.standard_payment === true,
    entryPoint: fields?.entry_point?.Custom === "anchor_dossier",
    storedPackageTarget: packageTarget?.addr?.toLowerCase() === expectedPackageAddress,
    packageVersion: packageTarget?.version === null,
    runtime: stored?.runtime === "VmCasperV1",
    exactArgumentCount: Array.isArray(args) && args.length === requiredSchemaArgs.length,
    schemaArgumentsPresent: missingArgs.length === 0,
    schemaArgumentTypes: wrongTypes.length === 0,
    deterministicArgumentValues: wrongValues.length === 0
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(`Unsigned anchor transaction validation failed: ${failures.join(", ")}`);
  }
  process.stdout.write(`package_hash=${process.env.EXPECTED_PACKAGE_HASH}\n`);
  process.stdout.write(`entry_point=anchor_dossier\n`);
  process.stdout.write(`job_id=${namedArgs.get("job_id").parsed}\n`);
  process.stdout.write(`dossier_hash=${namedArgs.get("dossier_hash").parsed}\n`);
  process.stdout.write(`artifact_root_hash=${namedArgs.get("artifact_root_hash").parsed}\n`);
  process.stdout.write(`artifact_count=${namedArgs.get("artifact_count").parsed}\n`);
  process.stdout.write(`pricing_mode=PaymentLimited\n`);
  process.stdout.write(`target=Stored/ByPackageHash\n`);
  process.stdout.write(`runtime=${stored.runtime}\n`);
  process.stdout.write(`approvals=0\n`);
  process.stdout.write(`broadcast=false\n`);
'
