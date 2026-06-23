# Uzoma

**AI agents that ship verifiable on-chain work.**

Uzoma is an agent-native delivery workspace that turns smart-contract requests into structured specialist workflows, accepted artifacts, and verifiable Build Dossiers. The delivery workflow runs locally; the accepted Milestone Escrow dossier has been anchored through a real Odra registry deployed on Casper Testnet.

## The problem

Generating code is easy. Accountable delivery is not.

- A code block is not a verifiable delivery record.
- Builders should not be the only reviewers of their own work.
- Requirements drift when planning, implementation, and review are disconnected.
- Accepted artifacts need stable hashes, receipts, and approval evidence.

## The Uzoma solution

Uzoma makes each handoff explicit. A lead agent decomposes a request, specialist agents produce bounded artifacts, an independent reviewer validates the evidence, and the accepted result becomes a portable Build Dossier.

The seeded workflow produces:

- a requirements and acceptance-criteria specification;
- an Odra-style Rust implementation artifact;
- a test report covering success, failure, and edge cases;
- an independent acceptance review;
- a deterministic dossier hash and four-artifact root;
- a confirmed Casper Testnet proof for the accepted demo dossier.

## Multi-agent workflow

```text
Request → Plan → Build → Test → Review → Dossier
            Atlas   Forge   Sentinel   Verity
```

- **Atlas** turns product intent into scoped acceptance criteria.
- **Forge** builds contract artifacts against the approved specification.
- **Sentinel** validates success paths, failure paths, and edge cases.
- **Verity** independently checks the evidence before delivery is accepted.

These specialist profiles are local delivery services in the current build. MCP discovery remains integration architecture; the app does not claim a live MCP connection.

## DeFi and RWA relevance

The default Milestone Escrow request models a common DeFi and real-world-asset delivery problem: funds or value should move only after explicit authority checks, accepted milestones, timeout protection, adversarial testing, and independent review.

Uzoma does not execute escrow payments. It demonstrates the delivery and proof layer around contract work—how a milestone specification, implementation, tests, review, and final acceptance can remain connected and verifiable.

## Architecture

| Layer | Current status |
| --- | --- |
| Multi-agent delivery workflow | Implemented locally |
| Artifact generation and acceptance | Implemented locally |
| Deterministic Build Dossier | Implemented locally |
| Odra `BuildDossierRegistry` | Deployed on Casper Testnet |
| Demo dossier proof event | Confirmed on Casper Testnet |
| MCP specialist discovery | Integration architecture |
| x402 settlement | Integration architecture; mock receipts only |
| Browser wallet signing | Not implemented |
| Automatic anchoring of future jobs | Not implemented |

The browser contains no private key handling, signing, contract-write, payment, or automatic-anchoring logic. Local workflow status and Casper anchor status are modeled separately.

## Real Casper Testnet proof

The public proof below is intentionally committed in [`lib/casper/demo-proof.json`](lib/casper/demo-proof.json) and exposed through the typed record in [`lib/casper/proof.ts`](lib/casper/proof.ts).

**Status: Anchored on Casper Testnet — Confirmed on-chain proof in the live Testnet registry.**

| Proof identifier | Value |
| --- | --- |
| Network | Casper Testnet (`casper-test`) |
| Registry | `BuildDossierRegistry` |
| Package hash | `hash-c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80` |
| Install transaction | `e1d83864185afa35e16fe87ddee3799822dfc1d59a92f03b9c5dae89b6e81ec0` |
| Anchor transaction | `770848c2ac6d2ef68133e03b7e567f2dec4bb255f34b9c79128174e5e2527658` |
| Dossier hash | `sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd` |
| Artifact root | `sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4` |
| Accepted artifacts | `4` |
| Anchor block | `8274002` |
| Recorded at | `2026-06-23T10:43:05.789Z` |

The confirmed Casper Event Standard record contains dossier ID `1`, the creator account hash, job ID, dossier hash, artifact root, artifact count, `accepted = true`, and the recorded block time.

### Verify the proof read-only

Install Casper client `5.0.1`, then run:

```bash
cd contracts/build-dossier-registry
./scripts/verify-demo-anchor.sh
```

The script uses only read-only Casper RPC commands. It resolves the package and current contract, validates the generated schema against the deployed entry point, reads event `__events[0]`, and decodes the complete `DossierAnchored` record. It does not request a secret key, sign, deploy, anchor, or submit a transaction. Public Testnet RPC rate limiting can occasionally require a later retry.

## Run locally

Prerequisites:

- Node.js 20 or newer;
- npm;
- Rust nightly with `wasm32-unknown-unknown` for contract work;
- `cargo-odra 0.1.7` and Odra `2.8.1` for the contract build;
- `wasm-validate` from WABT for WASM validation.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Frontend quality commands:

```bash
npm run lint
npm run typecheck
npm run build
```

## Contract tests and build

```bash
cargo +nightly test --manifest-path contracts/build-dossier-registry/Cargo.toml --all-targets

cd contracts/build-dossier-registry
cargo odra build
wasm-validate wasm/BuildDossierRegistry.wasm
```

The optimized WASM is reproducible build output and is intentionally ignored. Contract source, the lockfile, generated schemas, deterministic demo fixture, verification tools, and guarded operator templates belong in version control.

## Demo flow for judges

1. Open the landing page and select **Open Workspace**.
2. In **Recent accepted deliveries**, open **Milestone Escrow Contract** and point out the dynamic `Accepted` state.
3. Review the lead-agent orchestration log and Atlas, Forge, Sentinel, and Verity artifacts.
4. Open the completed Build Dossier.
5. Copy the dossier hash and inspect the accepted artifact manifest.
6. In **Casper Testnet Anchor**, show the confirmed package, install transaction, anchor transaction, artifact root, on-chain acceptance state, timestamp, and block.
7. Open **Architecture** and distinguish the live Testnet proof layer from planned MCP discovery and x402 settlement.
8. Optionally run `./scripts/verify-demo-anchor.sh` in a prepared terminal to reproduce the read-only proof.

## Routes

- `/` — product landing page
- `/workspace` — dynamic workspace metrics and job sections
- `/jobs` and `/jobs/[id]` — delivery queue and workflow detail
- `/dossier/[id]` — accepted Build Dossier and Casper Testnet proof
- `/agents` — specialist profiles
- `/activity` — local workflow audit trail
- `/architecture` — implemented boundaries and planned integrations

## Honest limitations

- The specialist workflow and generated delivery artifacts are deterministic local application state.
- Only the seeded `demo-escrow` Build Dossier is confirmed on Casper Testnet.
- Newly created jobs are not automatically anchored.
- MCP discovery is not active.
- x402 payments and settlement are not executed; receipt amounts are mock delivery accounting.
- Browser wallet connection and signing are not implemented.
- The registry deployment and proof are Testnet-only.
- No compatible Testnet explorer link is shown because one was not reliably verified for this build.

See [`contracts/build-dossier-registry/README.md`](contracts/build-dossier-registry/README.md) for the contract and operator workflow, and [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md) for the final submission handoff.
