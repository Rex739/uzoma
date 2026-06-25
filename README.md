# Uzoma

**AI agents that ship verifiable on-chain work.**

Uzoma is an agent-native delivery workspace that turns smart-contract requests into structured specialist workflows, accepted artifacts, and verifiable Build Dossiers. The deployed on-chain component is Uzoma’s `BuildDossierRegistry` on Casper Testnet. The Milestone Escrow implementation shown in the demo is a reviewed delivery-artifact preview; it is not the deployed contract.

## What is live now

- **Live Lead Agent planning** — new requests can receive structured plans, assurance assessments, specialist assignments, acceptance criteria, and review requirements through the server-side OpenAI integration.
- **Structured delivery workflow** — Axiom, Forge, Sentinel, and Verity model deterministic local specification, build, test, and review stages.
- **Evidence-backed Build Dossiers** — accepted delivery records include artifacts, reviews, deterministic hashes, and artifact roots.
- **Casper Testnet proof** — the deployed `BuildDossierRegistry` contains a confirmed anchor for the seeded `demo-escrow` dossier.

New jobs are planned live when configured, but are not automatically anchored; Casper anchoring remains a deliberate action after accepted evidence is ready.

## The problem

Generating code is easy. Accountable delivery is not.

- A code block is not a verifiable delivery record.
- Builders should not be the only reviewers of their own work.
- Requirements drift when planning, implementation, and review are disconnected.
- Accepted artifacts need stable hashes, receipts, and approval evidence.

## The Uzoma solution

Uzoma makes each handoff explicit. A constrained server-side Lead Agent can use the OpenAI Responses API to turn a new delivery brief into validated acceptance criteria, specialist assignments, review requirements, and an explicit Casper anchoring policy. After a plan is created, the current build models specialist execution through deterministic local orchestration. This produces bounded artifacts, test evidence, independent-review records, and a portable Build Dossier.

The seeded workflow produces:

- a requirements and acceptance-criteria specification;
- a reviewed Milestone Escrow implementation preview;
- a test report covering success, failure, and edge cases;
- an independent acceptance review;
- a deterministic dossier hash and four-artifact root;
- a confirmed Casper Testnet proof for the accepted demo dossier.

## Multi-agent workflow

```text
Request → Plan → Build → Test → Review → Dossier
            Axiom   Forge   Sentinel   Verity
            Define  Build   Test       Verify
```

- **Axiom** defines requirements, workflow states, roles, invariants, acceptance criteria, and implementation boundaries.
- **Forge** builds contract artifacts against the approved specification.
- **Sentinel** validates success paths, failure paths, and edge cases.
- **Verity** independently checks the evidence before delivery is accepted.

These specialist profiles are local delivery services in the current build. MCP discovery remains planned integration; the app does not claim a live MCP connection.

### Server-side Lead Agent

The live planner uses the official OpenAI Node SDK, the Responses API, and a strict Zod-backed structured output. The API key is read only inside the Node.js route; it is never returned to the browser, persisted in local workflow state, or written to logs.

Copy the variable names from `.env.example` into your own ignored local environment or hosting-provider secret store:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4-mini
```

Model availability depends on the API project. Use a model available to your project that supports Uzoma’s structured planning workflow.

Both values are required. If `OPENAI_MODEL` is missing, the server returns a clear configuration error rather than selecting a hardcoded model. OpenAI API usage can incur model charges, so configure account limits appropriate to the demo. Never commit the key or expose it through a `NEXT_PUBLIC_` variable.

The Lead Agent model is configured server-side through OPENAI_MODEL. Model names and provider credentials are not shown in the primary product UI.

### Lead Agent troubleshooting

Model availability and feature support depend on the API project and credentials configured on the server. Uzoma does not assume that a model string is accessible merely because it is present in `OPENAI_MODEL`, and it does not silently select a fallback model. After changing the model, fully restart `npm run dev`.

Provider failures are mapped to safe categories for unavailable or unsupported models, invalid credentials, insufficient quota, rate limits, malformed structured output, outages, and unknown errors. Public errors never include raw provider messages, request IDs, credentials, project identifiers, or response bodies.

When the key is missing or the provider fails, Uzoma does not impersonate a live response. The create-request dialog offers a separate, explicit **Use deterministic demo plan** action. Those jobs are stored as `agentMode: deterministic_demo`; successful API plans are stored as `agentMode: live`.

Lead Agent planning never deploys a contract, signs a transaction, sends a payment, or anchors a dossier. Casper anchoring remains a separate operator-controlled action after local acceptance.

Requester priority and Lead Agent assurance are deliberately separate:

- **Requester priority** (`Standard`, `High`, or `Critical`) is the urgency and delivery importance selected by the requester. The Lead Agent never changes it.
- **Assurance level** (`Low`, `Medium`, or `High`) is the Lead Agent’s independent assessment of the controls, review, and verification required before acceptance.

High assurance does not mean a request is invalid or unsafe to build. It means stronger authority checks, evidence requirements, failure-path testing, and independent review should be satisfied before the delivery is accepted. A job can therefore correctly show both **High priority** and **Assurance level: High**.

## DeFi and RWA relevance

The default Milestone Escrow request models a common DeFi and real-world-asset delivery problem: funds or value should move only after explicit authority checks, accepted milestones, timeout protection, adversarial testing, and independent review.

Uzoma does not execute escrow payments. It demonstrates the delivery and proof layer around contract work—how a milestone specification, implementation, tests, review, and final acceptance can remain connected and verifiable.

## Architecture

| Layer                              | Current status                                |
| ---------------------------------- | --------------------------------------------- |
| Multi-agent delivery workflow      | Implemented locally                           |
| Artifact generation and acceptance | Implemented locally                           |
| Deterministic Build Dossier        | Implemented locally                           |
| Odra `BuildDossierRegistry`        | Deployed on Casper Testnet                    |
| Demo dossier proof event           | Confirmed on Casper Testnet                   |
| MCP specialist discovery           | Planned integration                           |
| x402 settlement                    | Planned integration; mock delivery accounting |
| Browser wallet signing             | Planned integration                           |
| Automatic anchoring of future jobs | Explicit operator action only                 |

The browser contains no private key handling, signing, contract-write, payment, or automatic-anchoring logic. Local workflow status and Casper anchor status are modeled separately.

Uzoma does not represent local workflow completion as an on-chain event; local and Casper proof statuses are modeled separately.

## Real Casper Testnet proof

The public proof below is intentionally committed in [`lib/casper/demo-proof.json`](lib/casper/demo-proof.json) and exposed through the typed record in [`lib/casper/proof.ts`](lib/casper/proof.ts).

**Status: Anchored on Casper Testnet — Confirmed on-chain proof in the live Testnet registry.**

The deployed on-chain component is Uzoma’s `BuildDossierRegistry` on Casper Testnet. The Milestone Escrow implementation shown in the demo is a reviewed delivery-artifact preview; it is not the deployed contract.

| Proof identifier    | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Network             | Casper Testnet (`casper-test`)                                            |
| Registry            | `BuildDossierRegistry`                                                    |
| Package hash        | `hash-c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80`   |
| Install transaction | `e1d83864185afa35e16fe87ddee3799822dfc1d59a92f03b9c5dae89b6e81ec0`        |
| Anchor transaction  | `770848c2ac6d2ef68133e03b7e567f2dec4bb255f34b9c79128174e5e2527658`        |
| Dossier hash        | `sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd` |
| Artifact root       | `sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4` |
| Accepted artifacts  | `4`                                                                       |
| Anchor block        | `8274002`                                                                 |
| Recorded at         | `2026-06-23T10:43:05.789Z`                                                |

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

- Node.js 20.19+, 22.13+, or 24+;
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
npm test
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

1. Open **Create Build Request** and show a completed `LIVE AGENT PLAN`, including Assurance Level, rationale, specialist assignments, and acceptance criteria.
2. Open the generated local dossier and point out that new work is not automatically Casper-anchored.
3. Open the completed seeded `demo-escrow` Build Dossier.
4. In **Casper Testnet Anchor**, show the registry package hash, install transaction, anchor transaction, accepted state, artifact root, timestamp, and block.
5. Optionally run `./scripts/verify-demo-anchor.sh` to reproduce the proof through read-only RPC verification.

## Routes

- `/` — product landing page
- `/workspace` — dynamic workspace metrics and job sections
- `/jobs` and `/jobs/[id]` — delivery queue and workflow detail
- `/dossier/[id]` — accepted Build Dossier and Casper Testnet proof
- `/agents` — specialist profiles
- `/activity` — local workflow audit trail
- `/architecture` — implemented boundaries and planned integrations

## Implementation boundaries

Uzoma intentionally separates planning, local delivery orchestration, and on-chain proof.

- New request planning can run through the configured server-side Lead Agent.
- Specialist execution, artifact generation, reviews, and receipt accounting are deterministic local workflow state in the current build.
- Only the seeded `demo-escrow` Build Dossier has confirmed Casper Testnet proof.
- New jobs are not automatically anchored.
- Receipt amounts are delivery accounting only; no payment or settlement is executed.
- MCP discovery, x402 settlement, browser wallet connection, and user signing are planned integration surfaces.
- The current registry deployment and proof are Testnet-only.

See [`contracts/build-dossier-registry/README.md`](contracts/build-dossier-registry/README.md) for the contract and operator workflow, and [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md) for the final submission handoff.
