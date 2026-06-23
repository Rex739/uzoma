# BuildDossierRegistry

`BuildDossierRegistry` is Uzoma's minimal Casper proof-anchoring contract. It stores an append-only record proving that a completed Build Dossier existed in an accepted state at a specific Casper block time. This package contains no frontend transaction integration, wallet automation, payments, or MCP discovery. Its guarded operator templates never deploy or anchor automatically.

The contract uses Odra `2.8.1` and records:

- a one-based dossier ID;
- the anchoring Casper caller identity;
- the Uzoma job ID;
- the Build Dossier hash;
- the accepted artifact-set root hash;
- the accepted artifact count;
- `accepted = true` for this MVP;
- the Casper block time in milliseconds.

The network label is intentionally not stored on-chain. It belongs to deployment metadata.

## Live Casper Testnet deployment

The registry is deployed and the seeded `demo-escrow` dossier has confirmed on-chain proof:

- package hash: `hash-c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80`;
- install transaction: `e1d83864185afa35e16fe87ddee3799822dfc1d59a92f03b9c5dae89b6e81ec0`;
- anchor transaction: `770848c2ac6d2ef68133e03b7e567f2dec4bb255f34b9c79128174e5e2527658`.

These are public Testnet identifiers, not credentials. The guarded deployment and anchor scripts remain manual operator tools; they never run automatically.

## Local tests and build

From the repository root:

```bash
cargo +nightly test --manifest-path contracts/build-dossier-registry/Cargo.toml
cargo +nightly build --manifest-path contracts/build-dossier-registry/Cargo.toml
```

From the contract directory, produce the optimized Casper WASM with `cargo-odra 0.1.7` and validate it:

```bash
cd contracts/build-dossier-registry
cargo odra build
wasm-validate wasm/BuildDossierRegistry.wasm
```

## Casper Testnet prerequisites

Personally create a dedicated Casper Testnet deployer account, protect its secret key outside this repository, and fund it from the official Testnet faucet. Do not reuse a production account. Confirm the current RPC URL and chain name from your chosen node. The templates require:

```bash
export CASPER_TESTNET_RPC="https://YOUR-TESTNET-NODE-RPC"
export CASPER_CHAIN_NAME="CHAIN-NAME-REPORTED-BY-THE-NODE"
export CASPER_SECRET_KEY_PATH="/absolute/path/outside/repo/secret_key.pem"
export CASPER_PUBLIC_KEY="YOUR-CASPER-PUBLIC-KEY"
export CASPER_PAYMENT_AMOUNT="YOUR-DELIBERATELY-REVIEWED-MOTES-AMOUNT"
export UZOMA_CONFIRM_PAYMENT_AMOUNT="YES"
```

Never commit secret keys, key paths, `.env` files, funded account credentials, or generated command output. Never paste a secret key into Codex, chat, an issue, or a terminal command. Never place secrets in frontend code. Keep every local key path outside the repository. Common key formats, local environments, WASM output, and non-example deployment records are ignored. The committed deployment JSON contains placeholders only.

The committed typed proof fixture and read-only verifier establish the current public Testnet record. Deployment templates remain reproducible operator workflows and must not be interpreted as automatic deployment or anchoring.

## Deployment mechanism

Odra `2.8.1` generates `wasm/BuildDossierRegistry.wasm` as installer/session WASM. It is submitted directly with Casper client 5's `put-transaction session` command. The WASM exports `call`; the installer invokes the contract's zero-argument `init()` method. No separate installer artifact or application initializer argument is required.

The generated Casper contract schema declares four required installer arguments: `odra_cfg_package_hash_key_name: String`, `odra_cfg_allow_key_override: Bool`, `odra_cfg_is_upgradable: Bool`, and `odra_cfg_is_upgrade: Bool`. A first installation must pass `odra_cfg_is_upgrade = false`. Omitting it causes Odra 2.8.1's `ExecutionError::MissingArg` (`User error: 64658`) before `init()` runs.

The syntax below was verified locally against `Casper client 5.0.1`, not inferred from an older deploy API. Reproduce the relevant local help evidence with:

```bash
casper-client put-transaction session --help
casper-client put-transaction package --help
casper-client get-transaction --help
casper-client get-node-status --help
```

The session help exposes `--wasm-path`, `--session-entry-point`, and `--install-upgrade`; the package help exposes `--contract-package-hash`, repeatable `--session-arg`, and `--session-entry-point`; transaction status accepts the transaction hash as its positional argument.

The guarded template uses this exact command shape:

```bash
casper-client put-transaction session \
  --node-address "$CASPER_TESTNET_RPC" \
  --secret-key "$CASPER_SECRET_KEY_PATH" \
  --wasm-path wasm/BuildDossierRegistry.wasm \
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
```

`CASPER_PAYMENT_AMOUNT` must be chosen deliberately for Testnet and must never be guessed blindly. It is a positive integer in motes. Review current network guidance and the speculative result where available, then explicitly set `UZOMA_CONFIRM_PAYMENT_AMOUNT=YES`. Speculative cost is advisory and can differ from final execution cost.

For Casper client `5.0.1`, `classic` pricing becomes a `PaymentLimited` transaction and requires all three fields: `--payment-amount`, `--gas-price-tolerance`, and `--standard-payment true`. The live `casper-test` chainspec currently uses `payment_limited` pricing. Newer documentation may call the input `--transaction-path` and the lane `--category install-upgrade`; this installed client instead accepts `--wasm-path` and represents that category with `--install-upgrade`.

Construct and structurally validate an unsigned transaction locally without reading a key or contacting an RPC:

```bash
CASPER_PAYMENT_AMOUNT="AMOUNT-UNDER-REVIEW" \
  ./scripts/inspect-install-transaction.sh
```

The inspector uses `make-transaction session`, an initiator public key, and a temporary output file. It verifies `PaymentLimited`, install/upgrade targeting, VM Casper v1, all four typed Odra installer arguments and their values, zero application initializer arguments, and zero approvals, then deletes the file. It never signs or broadcasts. The deployment template runs this guard before its submitting command.

### Speculative execution endpoint requirement

Casper client `5.0.1` sends transaction simulations through the JSON-RPC method `speculative_exec_txn`. The public endpoint `https://node.testnet.casper.network/rpc` currently does **not** advertise that method in `list-rpcs` and returns JSON-RPC error `-32601 Method not found` for an empty-parameter capability probe. It cannot be used for install simulation.

`scripts/speculate-install.sh` checks `list-rpcs` before reading the key or building a transaction and fails with a precise explanation when the method is unavailable. Speculation therefore requires a locally operated Casper Testnet node, or a separately verified operator endpoint with `speculative_exec_txn` enabled. No alternate public endpoint is documented here because none has been verified.

Casper client `5.0.1` supports optional non-committing speculative execution, but only through a two-step local transaction workflow:

```bash
casper-client make-transaction session \
  --secret-key "$CASPER_SECRET_KEY_PATH" \
  --wasm-path wasm/BuildDossierRegistry.wasm \
  --output /tmp/uzoma-install.json \
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

casper-client send-transaction \
  --node-address "$CASPER_TESTNET_RPC" \
  --wasm-path /tmp/uzoma-install.json \
  --speculative-exec
```

This attempts execution on one supporting node only. The client explicitly warns that full validation is not performed, success does not guarantee network execution, and reported cost need not match the final cost. `make-transaction` writes locally; `send-transaction --speculative-exec` does not put the transaction into consensus. Never replace it with an unreviewed payment guess.

## Preflight

Build the WASM, export the prerequisite variables, then run the read-only preflight:

```bash
cd contracts/build-dossier-registry
./scripts/preflight.sh
```

Preflight checks required tools, the WASM, deterministic demo evidence, variables, key-file existence without reading its contents, RPC reachability, and the node network identifier. It also resolves `CASPER_PUBLIC_KEY` with `get-account`, reads its main-purse balance with `query-balance`, prints the selected payment amount, and requires `UZOMA_CONFIRM_PAYMENT_AMOUNT=YES`. It submits nothing and fails safely.

## Deploy to Testnet

Read the full template. Copy it to an ignored local filename if customization is needed. Choose a payment amount and deliberately enable its confirmation guard:

```bash
export CASPER_PAYMENT_AMOUNT="YOUR-MOTES-AMOUNT"
export UZOMA_CONFIRM_PAYMENT_AMOUNT="YES"
export UZOMA_CONFIRM_TESTNET_DEPLOY="YES"
bash scripts/deploy-testnet.sh.template
```

The script submits the installer WASM, prints the real returned transaction hash, and changes `deployments/testnet.example.json` from placeholders to `submitted-unverified` local metadata. It never records the secret-key path. Review that file before any commit and restore the placeholder example after moving real metadata to an appropriate secure store.

## Verify installation

Verification is read-only and distinguishes pending, successful, and failed execution:

```bash
bash scripts/verify-testnet.sh.template REAL_INSTALL_TRANSACTION_HASH
```

After success, use the same transaction hash to confirm execution:

```bash
casper-client get-transaction \
  --node-address "$CASPER_TESTNET_RPC" \
  REAL_INSTALL_TRANSACTION_HASH
```

The execution result proves success and may include state effects, but Casper client `5.0.1` has no dedicated “package hash from transaction” command. The deterministic source for this installation is the deployer account named key because the deployment passes `odra_cfg_package_hash_key_name = BuildDossierRegistry`:

```bash
casper-client get-account \
  --node-address "$CASPER_TESTNET_RPC" \
  --account-identifier "$CASPER_PUBLIC_KEY"
```

In `result.account.named_keys`, find the entry whose `name` is exactly `BuildDossierRegistry`; its `key` is the formatted package hash (`hash-...`). This read-only command prints that exact value and fails if it is absent:

```bash
casper-client get-account \
  --node-address "$CASPER_TESTNET_RPC" \
  --account-identifier "$CASPER_PUBLIC_KEY" | node -e '
    let data = "";
    process.stdin.on("data", chunk => data += chunk);
    process.stdin.on("end", () => {
      const response = JSON.parse(data);
      const entry = response.result?.account?.named_keys?.find(
        item => item.name === "BuildDossierRegistry"
      );
      if (!entry?.key) throw new Error("BuildDossierRegistry named key not found");
      process.stdout.write(`${entry.key}\n`);
    });
  '
```

Do not use `BuildDossierRegistry_access_token`, which is an upgrade access URef. Confirm the package and inspect its versions/current contract hash with:

```bash
export CASPER_PACKAGE_HASH="hash-VALUE-FROM-THE-BuildDossierRegistry-NAMED-KEY"
casper-client query-global-state \
  --node-address "$CASPER_TESTNET_RPC" \
  --key "$CASPER_PACKAGE_HASH"
```

Record the package hash and current contract hash only after both the transaction succeeds and the named key exists.

## Deterministic demo evidence

The committed fixture contains exactly four accepted artifacts for `demo-escrow`. Canonicalization sorts object keys lexicographically, preserves array order, encodes canonical JSON as UTF-8 without insignificant whitespace, and hashes each artifact with SHA-256. Artifacts are sorted by stable key. The artifact root is SHA-256 over the four concatenated raw digest bytes in that order.

Reproduce every component hash and the root from the repository root:

```bash
npm run contracts:artifact-root
```

The rules and output are implemented in `scripts/compute-artifact-root.ts`; the root is computed, not hand-entered.

## Read-only Testnet proof verification

The deployed demo proof can be checked without a key, signature, or transaction submission:

```bash
./scripts/verify-demo-anchor.sh
```

The verifier resolves the deployed package and current contract with Casper client `5.0.1`, checks the generated schema against the on-chain entry point, reads Casper Event Standard item `__events[0]` at the confirmed anchor block, and decodes the complete `DossierAnchored` record. Pass `--write-fixture` only when intentionally refreshing the sanitized public frontend fixture after every check succeeds. The script contains no signing or submission command.

## Anchor the demo dossier

Only after a verified installation, set the actual package hash, inspect the computed evidence, estimate payment, and explicitly enable the anchor guard:

```bash
export CASPER_PACKAGE_HASH="hash-YOUR-VERIFIED-PACKAGE-HASH"
export CASPER_ANCHOR_PAYMENT_AMOUNT="20000000000"
export UZOMA_CONFIRM_PAYMENT_AMOUNT="YES"
export UZOMA_CONFIRM_ANCHOR="YES"
bash scripts/anchor-demo-dossier.sh.template
```

`20000000000` motes is the documented candidate for this anchor call only, not an automatic default or a guaranteed exact cost. Review it deliberately before setting the confirmation variable. The anchor workflow uses `CASPER_ANCHOR_PAYMENT_AMOUNT`; it never inherits the installation value from `CASPER_PAYMENT_AMOUNT`.

Before any signed submission, build and validate the exact unsigned package transaction locally:

```bash
CASPER_PACKAGE_HASH="hash-YOUR-VERIFIED-PACKAGE-HASH" \
CASPER_ANCHOR_PAYMENT_AMOUNT="20000000000" \
  ./scripts/inspect-anchor-transaction.sh
```

The inspector uses no RPC or secret key and prints `approvals=0` and `broadcast=false`. The guarded template calls it again before accessing the secret-key path. The template calls `anchor_dossier` with `job_id = demo-escrow`, the committed deterministic dossier hash, the freshly recomputed four-artifact root, and `artifact_count = 4`. It prints only a real returned transaction hash. For a future real dossier, create a reviewed fixture with the same schema, recompute its root, and inspect every argument before signing.

## Manual Testnet operator lifecycle

1. Test and build the pinned Odra contract locally.
2. Run read-only preflight against the selected Testnet node.
3. Deliberately submit installer WASM from a funded operator account.
4. Verify execution and retrieve package and contract identifiers.
5. Deliberately submit `anchor_dossier` with reproducible evidence.
6. Verify finality and persist real network metadata outside committed examples.

The confirmed deployment and demo anchor are documented above. Running tests, builds, inspectors, or the read-only verifier submits no additional transaction; only the explicitly guarded operator templates can write to Testnet.
