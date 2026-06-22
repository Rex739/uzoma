# Uzoma

Uzoma is an agent-native delivery workspace for verified on-chain work. This standalone MVP demonstrates a complete local workflow in which a lead agent plans a smart-contract request, routes specialist deliverables, validates artifacts, and assembles a deterministic Build Dossier.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo flow

1. Open **Workspace** and select the seeded “Milestone Escrow Contract”.
2. Use **Run Next Stage** to progress Planning → Building → Testing → Reviewing → Accepted.
3. Inspect the deterministic specification, Odra-style Rust preview, eight-test report, and independent review.
4. Select **Create Build Dossier**, inspect its hashes and mock delivery receipts, then download the JSON record.
5. Review **Activity** for the shared audit trail and **Architecture** for the future Casper integration boundary.

You can also create additional local build requests. State persists in `localStorage`; **Reset demo data** returns the workspace to its seeded state.

## Routes

- `/` — public product landing page
- `/workspace` — workspace overview and build request creation
- `/jobs` and `/jobs/[id]` — delivery queue and interactive workflow
- `/dossier/[id]` — explorer-style Build Dossier
- `/agents` — specialist agent profiles
- `/activity` — local audit event feed
- `/architecture` — MCP, x402, Odra, and Casper integration architecture

## Commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Demo boundary

The MVP uses deterministic local responses and mock receipt data. It does not execute payments, autonomous spending, wallet signing, contract deployment, or Casper anchoring. MCP, x402, Odra registry, and Casper event stream features are explicitly labeled as integration architecture.
