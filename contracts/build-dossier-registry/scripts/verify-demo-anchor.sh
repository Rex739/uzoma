#!/usr/bin/env bash

# Verifies the deployed demo dossier through public Casper Testnet state only.
# No secret key, signing command, or transaction-submission command is used.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SCHEMA_PATH="${CONTRACT_DIR}/resources/casper_contract_schemas/build_dossier_registry_schema.json"
FIXTURE_PATH="${REPO_DIR}/lib/casper/demo-proof.json"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

RPC="${CASPER_TESTNET_RPC:-https://node.testnet.casper.network/rpc}"
PACKAGE_HASH="hash-c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80"
INSTALL_TX="e1d83864185afa35e16fe87ddee3799822dfc1d59a92f03b9c5dae89b6e81ec0"
ANCHOR_TX="770848c2ac6d2ef68133e03b7e567f2dec4bb255f34b9c79128174e5e2527658"
ANCHOR_BLOCK_HASH="8e50be961c1eb9daff401c988c82ef7a3305a3ee4810bd6cde518d76dacf162d"
ANCHOR_BLOCK_HEIGHT="8274002"
EXPECTED_DOSSIER_HASH="sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd"
EXPECTED_ARTIFACT_ROOT_HASH="sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4"
EVENT_INDEX="0"
WRITE_FIXTURE="false"

if [[ "${1:-}" == "--write-fixture" ]]; then
  WRITE_FIXTURE="true"
elif [[ $# -gt 0 ]]; then
  printf 'Usage: %s [--write-fixture]\n' "$0" >&2
  exit 1
fi

command -v casper-client >/dev/null || { printf 'casper-client is required.\n' >&2; exit 1; }
command -v node >/dev/null || { printf 'node is required.\n' >&2; exit 1; }
[[ -f "$SCHEMA_PATH" ]] || { printf 'Generated schema not found at %s\n' "$SCHEMA_PATH" >&2; exit 1; }

PACKAGE_PATH="${TEMP_DIR}/package.json"
CONTRACT_PATH="${TEMP_DIR}/contract.json"
STATE_ROOT_PATH="${TEMP_DIR}/state-root.json"
EVENT_PATH="${TEMP_DIR}/event.json"

printf 'Resolving registry package and contract...\n' >&2
casper-client query-global-state --node-address "$RPC" --key "$PACKAGE_HASH" >"$PACKAGE_PATH"

CONTRACT_HASH="$(PACKAGE_PATH="$PACKAGE_PATH" node -e '
  const response = require(process.env.PACKAGE_PATH);
  const versions = response.result?.stored_value?.ContractPackage?.versions;
  const current = Array.isArray(versions) ? versions.at(-1) : undefined;
  if (!current?.contract_hash) throw new Error("No installed contract version found");
  process.stdout.write(current.contract_hash.replace(/^contract-/, "hash-"));
')"

casper-client query-global-state --node-address "$RPC" --key "$CONTRACT_HASH" >"$CONTRACT_PATH"

casper-client get-state-root-hash \
  --node-address "$RPC" \
  --block-identifier "$ANCHOR_BLOCK_HEIGHT" \
  >"$STATE_ROOT_PATH"

STATE_ROOT_HASH="$(STATE_ROOT_PATH="$STATE_ROOT_PATH" node -e '
  const response = require(process.env.STATE_ROOT_PATH);
  const hash = response.result?.state_root_hash;
  if (typeof hash !== "string") throw new Error("State root hash missing");
  process.stdout.write(hash);
')"

printf 'Reading Casper Event Standard dossier event...\n' >&2
casper-client get-dictionary-item \
  --node-address "$RPC" \
  --state-root-hash "$STATE_ROOT_HASH" \
  --contract-hash "$CONTRACT_HASH" \
  --dictionary-name "__events" \
  --dictionary-item-key "$EVENT_INDEX" \
  >"$EVENT_PATH"

PACKAGE_PATH="$PACKAGE_PATH" \
CONTRACT_PATH="$CONTRACT_PATH" \
STATE_ROOT_PATH="$STATE_ROOT_PATH" \
EVENT_PATH="$EVENT_PATH" \
SCHEMA_PATH="$SCHEMA_PATH" \
FIXTURE_PATH="$FIXTURE_PATH" \
EXPECTED_PACKAGE_HASH="$PACKAGE_HASH" \
EXPECTED_CONTRACT_HASH="$CONTRACT_HASH" \
EXPECTED_INSTALL_TX="$INSTALL_TX" \
EXPECTED_ANCHOR_TX="$ANCHOR_TX" \
EXPECTED_BLOCK_HASH="$ANCHOR_BLOCK_HASH" \
EXPECTED_BLOCK_HEIGHT="$ANCHOR_BLOCK_HEIGHT" \
EXPECTED_DOSSIER_HASH="$EXPECTED_DOSSIER_HASH" \
EXPECTED_ARTIFACT_ROOT_HASH="$EXPECTED_ARTIFACT_ROOT_HASH" \
EXPECTED_EVENT_INDEX="$EVENT_INDEX" \
WRITE_FIXTURE="$WRITE_FIXTURE" \
node -e '
  const fs = require("node:fs");
  const read = name => JSON.parse(fs.readFileSync(process.env[name], "utf8"));
  const packageState = read("PACKAGE_PATH");
  const contractState = read("CONTRACT_PATH");
  const stateRoot = read("STATE_ROOT_PATH");
  const eventState = read("EVENT_PATH");
  const schema = read("SCHEMA_PATH");
  const fail = message => { throw new Error(message); };
  const expect = (condition, message) => condition || fail(message);

  const schemaEntryPoint = schema.entry_points?.find(item => item.name === "anchor_dossier");
  const expectedArgs = [
    ["job_id", "String"],
    ["dossier_hash", "String"],
    ["artifact_root_hash", "String"],
    ["artifact_count", "U32"]
  ];
  expect(
    JSON.stringify(schemaEntryPoint?.arguments?.map(arg => [arg.name, arg.ty])) === JSON.stringify(expectedArgs),
    "Generated anchor schema does not match the expected signature"
  );
  const packageVersions = packageState.result?.stored_value?.ContractPackage?.versions;
  const currentVersion = Array.isArray(packageVersions) ? packageVersions.at(-1) : undefined;
  expect(currentVersion, "Current registry contract version missing");
  expect(
    currentVersion.contract_hash.replace(/^contract-/, "hash-") === process.env.EXPECTED_CONTRACT_HASH,
    "Resolved contract hash mismatch"
  );
  const contract = contractState.result?.stored_value?.Contract;
  expect(contract, "Contract state missing");
  expect(
    contract.contract_package_hash.replace(/^contract-package-/, "hash-") === process.env.EXPECTED_PACKAGE_HASH,
    "Contract does not belong to the expected package"
  );
  const onChainEntryPoint = contract.entry_points?.find(item => item.name === "anchor_dossier");
  expect(
    JSON.stringify(onChainEntryPoint?.args?.map(arg => [arg.name, arg.cl_type])) === JSON.stringify(expectedArgs),
    "On-chain anchor entry point does not match generated schema"
  );
  expect(contract.named_keys?.some(item => item.name === "__events"), "Contract event dictionary missing");

  const raw = eventState.result?.stored_value?.CLValue?.parsed;
  expect(Array.isArray(raw), "Event bytes missing");
  const bytes = Uint8Array.from(raw);
  let offset = 0;
  const take = length => {
    expect(offset + length <= bytes.length, "Unexpected end of event bytes");
    const value = bytes.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const u8 = () => take(1)[0];
  const u32 = () => new DataView(take(4).buffer).getUint32(0, true);
  const u64 = () => {
    const value = new DataView(take(8).buffer).getBigUint64(0, true);
    expect(value <= BigInt(Number.MAX_SAFE_INTEGER), "u64 is not safely representable");
    return Number(value);
  };
  const string = () => new TextDecoder().decode(take(u32()));
  const hex = value => Buffer.from(value).toString("hex");

  const eventName = string();
  const id = u64();
  const creatorKeyTag = u8();
  expect(creatorKeyTag === 0, "Event creator is not an account hash");
  const creator = `account-hash-${hex(take(32))}`;
  const record = {
    id,
    creator,
    jobId: string(),
    dossierHash: string(),
    artifactRootHash: string(),
    artifactCount: u32(),
    accepted: u8() === 1,
    recordedAt: u64()
  };
  expect(offset === bytes.length, "Unparsed event bytes remain");
  expect(eventName === "event_DossierAnchored", "Unexpected event type");
  expect(record.id === 1, "Unexpected dossier ID");
  expect(record.jobId === "demo-escrow", "Unexpected job ID");
  expect(record.dossierHash === process.env.EXPECTED_DOSSIER_HASH, "Unexpected dossier hash");
  expect(record.artifactRootHash === process.env.EXPECTED_ARTIFACT_ROOT_HASH, "Unexpected artifact root hash");
  expect(record.artifactCount === 4, "Unexpected artifact count");
  expect(record.accepted === true, "Dossier is not accepted");

  const blockHash = process.env.EXPECTED_BLOCK_HASH;
  const blockHeight = Number(process.env.EXPECTED_BLOCK_HEIGHT);
  const stateRootHash = stateRoot.result?.state_root_hash;
  const dictionaryKey = eventState.result?.dictionary_key;
  expect(typeof blockHash === "string" && Number.isInteger(blockHeight), "Anchor block reference missing");
  expect(typeof stateRootHash === "string" && typeof dictionaryKey === "string", "Event proof reference missing");

  const proof = {
    schema: "uzoma.casper-proof.v1",
    verifiedAt: new Date().toISOString(),
    network: "Casper Testnet",
    chainName: "casper-test",
    registry: "BuildDossierRegistry",
    status: "confirmed",
    packageHash: process.env.EXPECTED_PACKAGE_HASH,
    contractHash: process.env.EXPECTED_CONTRACT_HASH,
    installTransactionHash: process.env.EXPECTED_INSTALL_TX,
    anchorTransactionHash: process.env.EXPECTED_ANCHOR_TX,
    block: { hash: blockHash, height: blockHeight, stateRootHash },
    event: {
      dictionary: "__events",
      index: Number(process.env.EXPECTED_EVENT_INDEX),
      dictionaryKey,
      name: "DossierAnchored"
    },
    onChainRecord: {
      ...record,
      recordedAtIso: new Date(record.recordedAt).toISOString()
    }
  };

  if (process.env.WRITE_FIXTURE === "true") {
    fs.mkdirSync(require("node:path").dirname(process.env.FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(process.env.FIXTURE_PATH, `${JSON.stringify(proof, null, 2)}\n`);
  }
  process.stdout.write(`PASS confirmed on-chain proof\n`);
  process.stdout.write(`record_id=${record.id}\n`);
  process.stdout.write(`creator=${record.creator}\n`);
  process.stdout.write(`job_id=${record.jobId}\n`);
  process.stdout.write(`dossier_hash=${record.dossierHash}\n`);
  process.stdout.write(`artifact_root_hash=${record.artifactRootHash}\n`);
  process.stdout.write(`artifact_count=${record.artifactCount}\n`);
  process.stdout.write(`accepted=${record.accepted}\n`);
  process.stdout.write(`recorded_at=${proof.onChainRecord.recordedAtIso}\n`);
  process.stdout.write(`block_height=${blockHeight}\n`);
  process.stdout.write(`transaction_submitted=false\n`);
  if (process.env.WRITE_FIXTURE === "true") process.stdout.write(`fixture=${process.env.FIXTURE_PATH}\n`);
'
