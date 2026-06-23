#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WASM_PATH="${CONTRACT_DIR}/wasm/BuildDossierRegistry.wasm"
ROOT_CALCULATOR="${SCRIPT_DIR}/compute-artifact-root.ts"
TSX_PACKAGE="${CONTRACT_DIR}/../../node_modules/tsx"
FAILURES=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 is installed"
  else
    fail "$1 is required but was not found"
  fi
}

check_environment() {
  if [[ -n "${!1:-}" ]]; then
    pass "$1 is set"
  else
    fail "$1 is required"
  fi
}

printf 'Uzoma Casper Testnet preflight (read-only)\n\n'

check_command cargo
check_command casper-client
check_command wasm-validate
check_command node

if [[ -d "$TSX_PACKAGE" ]]; then
  pass "tsx TypeScript runner is installed"
else
  fail "tsx is required; run npm install from the repository root"
fi

if command -v cargo >/dev/null 2>&1 && cargo odra --version >/dev/null 2>&1; then
  pass "cargo-odra is installed"
else
  fail "cargo-odra is required but cargo odra --version failed"
fi

if [[ -f "$WASM_PATH" ]]; then
  pass "BuildDossierRegistry WASM exists"
else
  fail "WASM is missing; run cargo odra build from the contract directory"
fi

if [[ -f "$ROOT_CALCULATOR" && -d "$TSX_PACKAGE" ]]; then
  if (cd "${CONTRACT_DIR}/../.." && node --import tsx "$ROOT_CALCULATOR" --json >/dev/null 2>&1); then
    pass "deterministic demo artifact root can be computed"
  else
    fail "demo artifact root computation failed"
  fi
fi

check_environment CASPER_TESTNET_RPC
check_environment CASPER_CHAIN_NAME
check_environment CASPER_SECRET_KEY_PATH
check_environment CASPER_PUBLIC_KEY
check_environment CASPER_PAYMENT_AMOUNT

if [[ -n "${CASPER_PAYMENT_AMOUNT:-}" ]]; then
  printf 'WARNING  Selected Testnet payment amount: %s motes\n' "$CASPER_PAYMENT_AMOUNT"
  if [[ ! "$CASPER_PAYMENT_AMOUNT" =~ ^[1-9][0-9]*$ ]]; then
    fail "CASPER_PAYMENT_AMOUNT must be a positive integer in motes"
  elif [[ "${UZOMA_CONFIRM_PAYMENT_AMOUNT:-}" == "YES" ]]; then
    pass "selected payment amount was deliberately confirmed"
  else
    fail "set UZOMA_CONFIRM_PAYMENT_AMOUNT=YES after independently reviewing the selected amount"
  fi
fi

if [[ -n "${CASPER_SECRET_KEY_PATH:-}" ]]; then
  if [[ -f "$CASPER_SECRET_KEY_PATH" ]]; then
    pass "secret-key file exists (contents not read)"
  else
    fail "CASPER_SECRET_KEY_PATH does not point to a file"
  fi
fi

if command -v casper-client >/dev/null 2>&1 && [[ -n "${CASPER_TESTNET_RPC:-}" ]]; then
  if STATUS_RESPONSE="$(casper-client get-node-status --node-address "$CASPER_TESTNET_RPC" 2>/dev/null)" && [[ -n "$STATUS_RESPONSE" ]]; then
    pass "Casper RPC is reachable"
    REPORTED_CHAIN="$(printf '%s' "$STATUS_RESPONSE" | node -e '
      let data = "";
      process.stdin.on("data", chunk => data += chunk);
      process.stdin.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          process.stdout.write(parsed.result?.chainspec_name ?? "");
        } catch {}
      });
    ' 2>/dev/null)"
    if [[ -z "$REPORTED_CHAIN" ]]; then
      fail "RPC response did not include result.chainspec_name"
    elif [[ -n "${CASPER_CHAIN_NAME:-}" && "$REPORTED_CHAIN" == "$CASPER_CHAIN_NAME" ]]; then
      pass "RPC network identifier matches CASPER_CHAIN_NAME ($REPORTED_CHAIN)"
    elif [[ -n "${CASPER_CHAIN_NAME:-}" ]]; then
      fail "RPC reports '$REPORTED_CHAIN', not CASPER_CHAIN_NAME '$CASPER_CHAIN_NAME'"
    fi
  else
    fail "Casper RPC is not reachable with get-node-status"
  fi
fi

if command -v casper-client >/dev/null 2>&1 && [[ -n "${CASPER_TESTNET_RPC:-}" && -n "${CASPER_PUBLIC_KEY:-}" ]]; then
  if ACCOUNT_RESPONSE="$(casper-client get-account \
    --node-address "$CASPER_TESTNET_RPC" \
    --account-identifier "$CASPER_PUBLIC_KEY" 2>/dev/null)" && [[ -n "$ACCOUNT_RESPONSE" ]]; then
    ACCOUNT_READABLE="$(printf '%s' "$ACCOUNT_RESPONSE" | node -e '
      let data = "";
      process.stdin.on("data", chunk => data += chunk);
      process.stdin.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          process.stdout.write(parsed.result?.account ? "yes" : "");
        } catch {}
      });
    ' 2>/dev/null)"
    if [[ "$ACCOUNT_READABLE" == "yes" ]]; then
      pass "CASPER_PUBLIC_KEY resolves to a readable Testnet account"
    else
      fail "get-account returned no readable result.account"
    fi
  else
    fail "CASPER_PUBLIC_KEY could not be read from the selected RPC"
  fi

  if BALANCE_RESPONSE="$(casper-client query-balance \
    --node-address "$CASPER_TESTNET_RPC" \
    --purse-identifier "$CASPER_PUBLIC_KEY" 2>/dev/null)" && [[ -n "$BALANCE_RESPONSE" ]]; then
    BALANCE="$(printf '%s' "$BALANCE_RESPONSE" | node -e '
      let data = "";
      process.stdin.on("data", chunk => data += chunk);
      process.stdin.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const balance = parsed.result?.balance;
          if (typeof balance === "string" || typeof balance === "number") {
            process.stdout.write(String(balance));
          }
        } catch {}
      });
    ' 2>/dev/null)"
    if [[ -n "$BALANCE" ]]; then
      pass "Testnet account balance is readable ($BALANCE motes)"
    else
      fail "query-balance returned no readable result.balance"
    fi
  else
    fail "Testnet account balance could not be read from the selected RPC"
  fi
fi

printf '\n'
if [[ $FAILURES -gt 0 ]]; then
  printf 'Preflight failed safely with %d issue(s). No transaction was submitted.\n' "$FAILURES" >&2
  exit 1
fi

printf 'Preflight passed. No transaction was submitted.\n'
