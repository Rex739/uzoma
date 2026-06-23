#!/usr/bin/env bash

# Builds and validates an unsigned install transaction entirely locally.
# This script has no RPC argument, never reads a secret key, and never invokes
# put-transaction, send-transaction, sign-transaction, or speculative execution.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WASM_PATH="${CONTRACT_DIR}/wasm/BuildDossierRegistry.wasm"
SCHEMA_PATH="${CONTRACT_DIR}/resources/casper_contract_schemas/build_dossier_registry_schema.json"
TEMP_DIR="$(mktemp -d)"
TRANSACTION_PATH="${TEMP_DIR}/unsigned-install.json"
trap 'rm -rf "$TEMP_DIR"' EXIT

: "${CASPER_PUBLIC_KEY:?Set CASPER_PUBLIC_KEY to the deployer public key}"
: "${CASPER_CHAIN_NAME:?Set CASPER_CHAIN_NAME to the node-reported chain name}"
: "${CASPER_PAYMENT_AMOUNT:?Set CASPER_PAYMENT_AMOUNT to the amount under review}"

[[ "$CASPER_PAYMENT_AMOUNT" =~ ^[1-9][0-9]*$ ]] || {
  printf 'CASPER_PAYMENT_AMOUNT must be a positive integer in motes.\n' >&2
  exit 1
}
[[ -f "$WASM_PATH" ]] || { printf 'WASM not found at %s\n' "$WASM_PATH" >&2; exit 1; }
[[ -f "$SCHEMA_PATH" ]] || { printf 'Generated Casper contract schema not found at %s\n' "$SCHEMA_PATH" >&2; exit 1; }

casper-client make-transaction session \
  --initiator-address "$CASPER_PUBLIC_KEY" \
  --wasm-path "$WASM_PATH" \
  --output "$TRANSACTION_PATH" \
  --chain-name "$CASPER_CHAIN_NAME" \
  --pricing-mode classic \
  --payment-amount "$CASPER_PAYMENT_AMOUNT" \
  --standard-payment true \
  --gas-price-tolerance 1 \
  --transaction-runtime vm-casper-v1 \
  --session-entry-point call \
  --session-arg "odra_cfg_package_hash_key_name:string='BuildDossierRegistry'" \
  --session-arg "odra_cfg_allow_key_override:bool='false'" \
  --session-arg "odra_cfg_is_upgradable:bool='true'" \
  --session-arg "odra_cfg_is_upgrade:bool='false'" \
  --install-upgrade

TRANSACTION_PATH="$TRANSACTION_PATH" \
SCHEMA_PATH="$SCHEMA_PATH" \
EXPECTED_CHAIN="$CASPER_CHAIN_NAME" \
EXPECTED_PAYMENT="$CASPER_PAYMENT_AMOUNT" \
node -e '
  const fs = require("node:fs");
  const transaction = JSON.parse(fs.readFileSync(process.env.TRANSACTION_PATH, "utf8"));
  const schema = JSON.parse(fs.readFileSync(process.env.SCHEMA_PATH, "utf8"));
  const version = transaction.Version1;
  const payload = version?.payload;
  const pricing = payload?.pricing_mode?.PaymentLimited;
  const fields = payload?.fields;
  const session = fields?.target?.Session;
  const args = fields?.args?.Named;
  const namedArgs = new Map(Array.isArray(args) ? args : []);
  const packageKey = namedArgs.get("odra_cfg_package_hash_key_name");
  const allowOverride = namedArgs.get("odra_cfg_allow_key_override");
  const isUpgradable = namedArgs.get("odra_cfg_is_upgradable");
  const isUpgrade = namedArgs.get("odra_cfg_is_upgrade");
  const requiredSchemaArgs = (schema.call?.arguments ?? []).filter(arg => arg.optional === false);
  const missingSchemaArgs = requiredSchemaArgs.filter(arg => !namedArgs.has(arg.name));
  const wrongSchemaTypes = requiredSchemaArgs.filter(
    arg => namedArgs.get(arg.name)?.cl_type !== arg.ty
  );
  const checks = {
    version: Boolean(version),
    unsigned: Array.isArray(version?.approvals) && version.approvals.length === 0,
    chain: payload?.chain_name === process.env.EXPECTED_CHAIN,
    payment: String(pricing?.payment_amount) === process.env.EXPECTED_PAYMENT,
    gasPriceTolerance: pricing?.gas_price_tolerance === 1,
    standardPayment: pricing?.standard_payment === true,
    entryPoint: fields?.entry_point === "Call",
    installUpgrade: session?.is_install_upgrade === true,
    runtime: session?.runtime === "VmCasperV1",
    wasmPresent: typeof session?.module_bytes === "string" && session.module_bytes.length > 0,
    packageKeyArg: packageKey?.cl_type === "String" && packageKey?.parsed === "BuildDossierRegistry",
    allowOverrideArg: allowOverride?.cl_type === "Bool" && allowOverride?.parsed === false,
    isUpgradableArg: isUpgradable?.cl_type === "Bool" && isUpgradable?.parsed === true,
    isUpgradeArg: isUpgrade?.cl_type === "Bool" && isUpgrade?.parsed === false,
    schemaRequiredArgs: missingSchemaArgs.length === 0,
    schemaArgTypes: wrongSchemaTypes.length === 0,
    zeroApplicationInitArgs: Array.isArray(args) && args.length === requiredSchemaArgs.length
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(`Unsigned transaction validation failed: ${failures.join(", ")}`);
  }
  process.stdout.write(`PASS unsigned local install transaction\n`);
  process.stdout.write(`chain=${payload.chain_name}\n`);
  process.stdout.write(`pricing=PaymentLimited\n`);
  process.stdout.write(`payment_amount=${pricing.payment_amount}\n`);
  process.stdout.write(`gas_price_tolerance=${pricing.gas_price_tolerance}\n`);
  process.stdout.write(`standard_payment=${pricing.standard_payment}\n`);
  process.stdout.write(`target=Session/install-upgrade\n`);
  process.stdout.write(`runtime=${session.runtime}\n`);
  process.stdout.write(`odra_cfg_package_hash_key_name=${packageKey.parsed}\n`);
  process.stdout.write(`odra_cfg_allow_key_override=${allowOverride.parsed}\n`);
  process.stdout.write(`odra_cfg_is_upgradable=${isUpgradable.parsed}\n`);
  process.stdout.write(`odra_cfg_is_upgrade=${isUpgrade.parsed}\n`);
  process.stdout.write(`schema_required_args=${requiredSchemaArgs.length}\n`);
  process.stdout.write(`approvals=0\n`);
  process.stdout.write(`broadcast=false\n`);
'
