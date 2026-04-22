# 0G Hackathon Dual-Track Submission Plan

This document maps the current repo to both 0G hackathon tracks and lists the remaining artifacts required for a complete submission package.

## Project Summary

- **Project name:** 0G Forge (`og` CLI)
- **One-liner:** Terminal-native framework/tooling for prompt-driven app creation, preview, deployment, and lightweight state sync on 0G-integrated compute paths.
- **Repo:** https://github.com/karagozemin/0G
- **Working autonomous agent example:** `examples/goal-agent`

## Track Fit Decision

### Track A — Best Agent Framework, Tooling & Core Extensions

**Status:** Strong fit

Why:
- Framework/tooling-first architecture (`apps/cli`, `packages/*`)
- Reusable primitives for builders (create/edit pipeline, deploy runner, sync abstraction)
- 0G compute proxy integration path documented and implemented
- Includes a working example agent flow under `examples/goal-agent`

### Track B — Best Autonomous Agents, Swarms & iNFT Innovations

**Status:** Eligible with extra artifacts

Why:
- Can submit the `goal-agent` autonomous loop as a single-agent project
- Requires additional proof package (live demo, optional contract/iNFT if claimed)
- Architecture and runbook are included under `examples/goal-agent/ARCHITECTURE.md` and `examples/goal-agent/README.md`

## Protocol Features / SDKs Used

- **0G Compute (proxy-compatible):** login, model listing, generation request flow
  - Key refs: `packages/compute-client/src/compute-client.ts`, `apps/cli/src/create-edit-pipeline.ts`
- **0G-like persistent memory abstraction:** sync provider layer and local/http providers
  - Key refs: `packages/storage/src/index.ts`, `apps/cli/src/sync-runner.ts`
- **0G app workflow primitives:** init/create/edit/preview/deploy/sync command surface
  - Key refs: `apps/cli/src/index.ts`

## Required Submission Artifacts Checklist

### Common (Both Tracks)

- [ ] Project name + short description
- [ ] Contract deployment addresses (if onchain contracts are used)
- [x] Public GitHub repo with setup instructions
- [ ] Demo video (<3 minutes)
- [ ] Live demo link
- [x] Explain protocol features / SDK usage
- [ ] Team member names + contact info (Telegram, X)

### Track A Specific (Framework)

- [x] At least one working example agent built using framework/tooling
  - Example: `examples/goal-agent`
- [x] Architecture diagram (recommended)
  - See: `examples/goal-agent/ARCHITECTURE.md`

### Track B Specific (Autonomous Agents / Swarms / iNFT)

- [x] Autonomous single-agent flow documented and runnable
- [ ] If swarm submission: communication + coordination explanation
- [ ] If iNFT submission: minted iNFT explorer link + embedded intelligence proof

## Evidence Pointers In Repo

- Agent implementation: `examples/goal-agent/src/agent.mjs`
- Agent usage guide: `examples/goal-agent/README.md`
- Agent architecture diagram: `examples/goal-agent/ARCHITECTURE.md`
- Core framework command surface: `apps/cli/src/index.ts`
- Compute integration layer: `packages/compute-client/src/compute-client.ts`
- Memory/sync abstraction: `packages/storage/src/index.ts`

## Missing Items to Finalize Before Submit

1. **Demo assets**
   - Record 2–3 min video using `DEMO.md` + `examples/goal-agent/README.md`
   - Publish live demo link (e.g., deployed template + walkthrough)
2. **Team/contact metadata**
   - Add final names, Telegram, X handles
3. **Onchain proof (optional but recommended)**
   - If claiming iNFT/contract component, deploy and add addresses/explorer links
4. **Submission form payload**
   - Copy ready-to-paste text from this file and example README

## Submission Metadata Template (Copy/Paste)

- **Project name:** 0G Forge
- **Track:**
  - [ ] Best Agent Framework, Tooling & Core Extensions
  - [ ] Best Autonomous Agents, Swarms & iNFT Innovations
- **Short description:**
  - Terminal-native framework and autonomous goal-loop agent built on top of 0G-integrated compute workflows and persistent memory abstractions.
- **Protocol features used:**
  - 0G Compute proxy-compatible auth/model/generation pathways
  - Persistent memory sync provider abstraction (local/http)
- **Contract deployment addresses:**
  - `TBD`
- **Demo video link:**
  - `TBD`
- **Live demo link:**
  - `TBD`
- **Team members + contacts:**
  - `TBD`

## Notes

- If you submit to both tracks, keep a shared core narrative but separate highlight sections:
  - **Track A:** framework design, extensibility, developer ergonomics
  - **Track B:** agent autonomy loop behavior, persistence, and objective completion evidence
