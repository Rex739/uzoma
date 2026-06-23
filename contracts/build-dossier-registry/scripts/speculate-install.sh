#!/usr/bin/env bash

# Builds a signed transaction in a temporary directory and sends it exclusively
# to Casper's speculative execution RPC. It never calls put-transaction or a
# non-speculative send-transaction path, so it cannot enter consensus.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WASM_PATH="${CONTRACT_DIR}/wasm/BuildDossierRegistry.wasm"
TEMP_DIR="$(mktemp -d)"
TRANSACTION_PATH="${TEMP_DIR}/signed-install.json"
CAPABILITIES_PATH="${TEMP_DIR}/list-rpcs.json"
CAPABILITIES_ERROR_PATH="${TEMP_DIR}/list-rpcs.stderr"
MAKE_STDOUT_PATH="${TEMP_DIR}/make-transaction.stdout"
MAKE_STDERR_PATH="${TEMP_DIR}/make-transaction.stderr"
SEND_STDOUT_PATH="${TEMP_DIR}/speculative.stdout"
SEND_STDERR_PATH="${TEMP_DIR}/speculative.stderr"
trap 'rm -rf "$TEMP_DIR"' EXIT

print_redacted_file() {
  REDACT_PATH="$CASPER_SECRET_KEY_PATH" INPUT_PATH="$1" node -e '
    const fs = require("node:fs");
    const text = fs.readFileSync(process.env.INPUT_PATH, "utf8");
    const redacted = process.env.REDACT_PATH
      ? text.split(process.env.REDACT_PATH).join("[REDACTED_SECRET_KEY_PATH]")
      : text;
    process.stdout.write(redacted.length > 0 ? redacted : "(empty)\n");
  '
}

: "${CASPER_TESTNET_RPC:?Set CASPER_TESTNET_RPC to the Testnet JSON-RPC URL}"
: "${CASPER_CHAIN_NAME:?Set CASPER_CHAIN_NAME to the node-reported chain name}"
: "${CASPER_PUBLIC_KEY:?Set CASPER_PUBLIC_KEY to the deployer public key}"
: "${CASPER_SECRET_KEY_PATH:?Set CASPER_SECRET_KEY_PATH to the local secret key path}"
: "${CASPER_PAYMENT_AMOUNT:?Set CASPER_PAYMENT_AMOUNT to the candidate amount under review}"

if [[ "${UZOMA_CONFIRM_SPECULATIVE_EXEC:-}" != "YES" ]]; then
  printf 'Refusing speculative execution. Set UZOMA_CONFIRM_SPECULATIVE_EXEC=YES after reviewing this script.\n' >&2
  exit 1
fi
[[ "$CASPER_PAYMENT_AMOUNT" =~ ^[1-9][0-9]*$ ]] || {
  printf 'CASPER_PAYMENT_AMOUNT must be a positive integer in motes.\n' >&2
  exit 1
}
[[ -f "$CASPER_SECRET_KEY_PATH" ]] || { printf 'Secret-key file not found; contents were not read.\n' >&2; exit 1; }
[[ -f "$WASM_PATH" ]] || { printf 'WASM not found at %s\n' "$WASM_PATH" >&2; exit 1; }

# Fail before reading the key when the selected endpoint does not advertise the
# transaction speculative-execution RPC required by Casper client 5.0.1.
set +e
casper-client list-rpcs \
  --node-address "$CASPER_TESTNET_RPC" \
  >"$CAPABILITIES_PATH" 2>"$CAPABILITIES_ERROR_PATH"
CAPABILITIES_EXIT_CODE=$?
set -e
if [[ $CAPABILITIES_EXIT_CODE -ne 0 ]]; then
  printf 'Unable to inspect RPC capabilities (exit_code=%d).\n' "$CAPABILITIES_EXIT_CODE" >&2
  printf 'stderr:\n' >&2
  print_redacted_file "$CAPABILITIES_ERROR_PATH" >&2
  printf 'stdout:\n' >&2
  print_redacted_file "$CAPABILITIES_PATH" >&2
  exit 1
fi
if ! CAPABILITIES_PATH="$CAPABILITIES_PATH" node -e '
  const fs = require("node:fs");
  const response = JSON.parse(fs.readFileSync(process.env.CAPABILITIES_PATH, "utf8"));
  process.exit(JSON.stringify(response).includes("speculative_exec_txn") ? 0 : 1);
'; then
  printf 'Speculative execution unavailable: the selected RPC does not advertise speculative_exec_txn.\n' >&2
  printf 'Use a locally operated Casper node or a separately verified operator endpoint with that method enabled.\n' >&2
  printf 'No transaction was built, signed, or sent.\n' >&2
  exit 1
fi

printf 'Building a signed transaction locally in temporary storage...\n'
set +e
casper-client make-transaction session \
  --secret-key "$CASPER_SECRET_KEY_PATH" \
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
  --install-upgrade \
  >"$MAKE_STDOUT_PATH" 2>"$MAKE_STDERR_PATH"
MAKE_EXIT_CODE=$?
set -e
if [[ $MAKE_EXIT_CODE -ne 0 ]]; then
  printf 'Local transaction build failed (exit_code=%d).\n' "$MAKE_EXIT_CODE" >&2
  printf 'stderr:\n' >&2
  print_redacted_file "$MAKE_STDERR_PATH" >&2
  printf 'stdout:\n' >&2
  print_redacted_file "$MAKE_STDOUT_PATH" >&2
  exit 1
fi

TRANSACTION_PATH="$TRANSACTION_PATH" node -e '
  const fs = require("node:fs");
  const transaction = JSON.parse(fs.readFileSync(process.env.TRANSACTION_PATH, "utf8"));
  const approvals = transaction.Version1?.approvals;
  const target = transaction.Version1?.payload?.fields?.target?.Session;
  if (!Array.isArray(approvals) || approvals.length === 0) {
    throw new Error("Temporary transaction is not signed; speculative execution aborted");
  }
  if (target?.is_install_upgrade !== true) {
    throw new Error("Temporary transaction is not classified as install/upgrade");
  }
'

printf 'Sending only to speculative_exec_txn; this does not broadcast into consensus...\n'
set +e
casper-client send-transaction \
  --node-address "$CASPER_TESTNET_RPC" \
  --speculative-exec \
  --wasm-path "$TRANSACTION_PATH" \
  >"$SEND_STDOUT_PATH" 2>"$SEND_STDERR_PATH"
SEND_EXIT_CODE=$?
set -e

printf 'process_exit_code=%d\n' "$SEND_EXIT_CODE"
printf 'stdout:\n'
print_redacted_file "$SEND_STDOUT_PATH"
printf 'stderr:\n'
print_redacted_file "$SEND_STDERR_PATH"

if [[ $SEND_EXIT_CODE -ne 0 ]]; then
  printf 'Speculative RPC request failed. The output above contains the sanitized CLI/JSON-RPC error body when supplied by the endpoint.\n' >&2
  exit 1
fi
RESPONSE="$(<"$SEND_STDOUT_PATH")"

printf '\nSpeculative execution response:\n'
printf '%s' "$RESPONSE" | node -e '
  let data = "";
  process.stdin.on("data", chunk => data += chunk);
  process.stdin.on("end", () => {
    try {
      process.stdout.write(`${JSON.stringify(JSON.parse(data), null, 2)}\n`);
    } catch {
      process.stdout.write(`${data}\n`);
    }
  });
'

printf '\nSpeculative execution summary:\n'
SPECULATIVE_RESPONSE="$RESPONSE" \
SELECTED_PAYMENT="$CASPER_PAYMENT_AMOUNT" \
node -e '
  const response = JSON.parse(process.env.SPECULATIVE_RESPONSE);
  if (response.error) {
    console.error(`success=false`);
    console.error(`rpc_error=${response.error.message ?? JSON.stringify(response.error)}`);
    process.exit(1);
  }
  const execution = response.result?.execution_result;
  if (!execution) {
    console.error("success=false");
    console.error("install_validation_issue=missing execution_result");
    process.exit(1);
  }
  const error = execution.error ?? null;
  const effects = Array.isArray(execution.effects) ? execution.effects.length : "unavailable";
  const messages = Array.isArray(execution.messages) ? execution.messages.length : "unavailable";
  console.log(`success=${error === null}`);
  console.log(`gas_limit=${execution.limit ?? "unavailable"}`);
  console.log(`gas_consumed=${execution.consumed ?? "unavailable"}`);
  console.log(`selected_payment_amount=${process.env.SELECTED_PAYMENT}`);
  console.log(`payment_model=PaymentLimited`);
  console.log(`gas_price_tolerance=1`);
  console.log(`effects=${effects}`);
  console.log(`messages=${messages}`);
  console.log(`execution_error=${error ?? "none"}`);
  console.log(`install_validation_issue=${error ?? "none"}`);
  console.log("state_committed=false");
  console.log("broadcast=false");
  if (error !== null) process.exit(1);
'
