# Uzoma Submission Checklist

## Submission links

- [ ] Deployed frontend URL: `TODO_DEPLOYED_FRONTEND_URL`
- [ ] GitHub repository URL: `TODO_GITHUB_REPOSITORY_URL`
- [ ] Demo video URL: `TODO_DEMO_VIDEO_URL`

## Casper Testnet proof

- Package hash: `hash-c1e00c7784953c4a944f76adf4cd3ef87745c97e60ebcd5667737af425574f80`
- Install transaction: `e1d83864185afa35e16fe87ddee3799822dfc1d59a92f03b9c5dae89b6e81ec0`
- Anchor transaction: `770848c2ac6d2ef68133e03b7e567f2dec4bb255f34b9c79128174e5e2527658`
- Dossier hash: `sha256:uzoma-dossier-demo-escrow4fd18b4fd18b4fd18b4fd18b4fd18b4fd18b4fd`
- Artifact root: `sha256:43b5d9face5f64d5009b8e3b02aff9ec8d7185c76ed0db58940a802d8ad108d4`
- Anchor block: `8274002`
- Anchor time: `2026-06-23T10:43:05.789Z`
- [ ] Run `contracts/build-dossier-registry/scripts/verify-demo-anchor.sh` read-only before recording, subject to public RPC availability.

## Required screenshots

- [ ] Close the browser Find overlay before screenshots or demo recording.
- [ ] Use a clean browser profile/window without unrelated tabs visible.
- [ ] Record the Build Dossier proof card with the full Casper Testnet Anchor state visible.
- [ ] Landing page hero and workflow
- [ ] Workspace with accepted delivery and “Casper Testnet anchored” indicator
- [ ] Completed Milestone Escrow job with specialist artifacts
- [ ] Build Dossier hash and accepted deliverables
- [ ] Confirmed Casper Testnet Anchor panel
- [ ] Architecture page showing live Testnet proof versus planned MCP/x402 layers
- [ ] Optional terminal capture of successful read-only proof verification

## DoraHacks submission fields

- [ ] Project name: `Uzoma`
- [ ] Tagline: `AI agents that ship verifiable on-chain work.`
- [ ] Track/category selected
- [ ] Short project description
- [ ] Problem and solution
- [ ] DeFi/RWA relevance
- [ ] Technical architecture
- [ ] Casper integration description
- [ ] Testnet proof identifiers
- [ ] GitHub repository URL
- [ ] Deployed frontend URL
- [ ] Demo video URL
- [ ] Team members and roles
- [ ] Technology tags: `Casper`, `Odra`, `Rust`, `Next.js`, `TypeScript`
- [ ] Honest limitations: local agents, one anchored demo dossier, no MCP discovery, no x402 settlement, no browser wallet signing

## Final checks before submission

- [ ] Replace every `TODO_...` placeholder above.
- [ ] Verify the deployed frontend loads on desktop and mobile.
- [ ] Run the complete demo flow once from a clean browser profile.
- [ ] Confirm copy buttons and dossier JSON download work.
- [ ] Confirm no private key, PEM, `.env`, or local deployment metadata is staged.
- [ ] Confirm `lib/casper/demo-proof.json` is staged intentionally.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run contract tests and `wasm-validate`.
- [ ] Review `git diff --cached` before committing or pushing.
- [ ] Record the demo without submitting any additional Casper transaction.
