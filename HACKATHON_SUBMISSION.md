# 0G Forge — Hackathon Submission (Track 1: Agent Framework, Tooling & Core Extensions)

## Project Summary

- **Project name:** 0G Forge
- **Track:** Best Agent Framework, Tooling & Core Extensions
- **One-liner:** Terminal-native agent framework that lets developers build, preview, and deploy AI-generated apps using 0G Compute for inference, 0G Storage for persistent memory, and 0G Chain for on-chain framework registration.
- **Repo:** https://github.com/karagozemin/0g-forge

## Protocol Features & SDKs Used

| Feature | How It's Used | Code Reference |
|---|---|---|
| **0G Compute Network** | All `og create` / `og edit` generation calls hit `/v1/chat/completions` on 0G Compute | `packages/compute-client/src/compute-client.ts`, `apps/cli/src/create-edit-pipeline.ts` |
| **0G Storage (Indexer)** | `og sync push` uploads project sync payload as a file to 0G Storage Indexer | `packages/storage-0g/src/index.ts` |
| **0G Chain (EVM)** | `FrameworkRegistry.sol` stores the latest 0G Storage file hash per project + framework entry | `contracts/contracts/FrameworkRegistry.sol` |

## What Was Built

### Framework/Tooling Layer (`apps/cli/` + `packages/`)

A full agent framework as a CLI with:
- `og init` — scaffold a project from template (react-vite, nextjs-app, static-landing)
- `og create` — prompt → plan → unified diff → apply (uses 0G Compute inference)
- `og edit` — same pipeline on existing project files
- `og preview` — local dev server
- `og deploy vercel` — Vercel deployment
- `og sync push/pull` — metadata sync via 0G Storage + 0G Chain hash pointer
- `og model list/use` — model management against 0G Compute

### 0G Storage Provider (`packages/storage-0g/`)

Implements the `SyncProvider` interface using `@0glabs/0g-ts-sdk`:
- `push`: uploads JSON payload to 0G Storage Indexer → stores file hash on 0G Chain contract
- `pull`: reads hash from 0G Chain → downloads payload from 0G Storage

Activated with: `OG_STORAGE_ENABLED=1`

### On-Chain Registry (`contracts/FrameworkRegistry.sol`)

Deployed on 0G Chain (EVM-compatible, chainId 16600):
- `registerFramework(name, version, repoUrl)` — publishes framework entries on-chain
- `setSyncHash(projectKey, fileHash)` — stores latest 0G Storage pointer per project
- `getSyncHash(projectKey)` — reads pointer for sync pull

**Deployed contract address:** `0x495F79138BEc9c6241eC2fAC1524AB3e9214832E` (0G Chain Galileo Testnet, chainId 16602)

### Autonomous Goal Agent (`examples/goal-agent/`)

Two variants:
- `agent.mjs` — basic version, mock mode, sequential goals
- `agent-0g.mjs` — **0G-native** with:
  - Reflection loop (evaluates each step: continue / retry / skip)
  - 0G Storage memory persistence
  - 0G Chain self-registration
  - Dynamic retry on failure

## Architecture Diagram

```
Developer / CI
      │
      ▼
og CLI (apps/cli/)
  ├── og create/edit ─────────────► 0G Compute Network
  │    └── plan + diff + apply          (inference)
  │
  ├── og sync push/pull ─────────► 0G Storage (Indexer)
  │    └── JSON payload upload          (file persistence)
  │         └── hash ──────────────► 0G Chain (FrameworkRegistry)
  │                                      (on-chain pointer)
  │
  └── og deploy vercel ──────────► Vercel
       └── deployment URL

examples/goal-agent/src/agent-0g.mjs
  ├── reads goals[]
  ├── for each goal:
  │    ├── og create / og edit
  │    ├── reflect() → continue | retry | skip
  │    └── write memory to 0G Storage
  └── registerOnChain() → FrameworkRegistry.registerFramework()
```

## Submission Checklist

- [x] Project name + short description
- [ ] **Contract deployment addresses** ← deploy with `cd contracts && npm run deploy:testnet`
- [x] Public GitHub repo with README + setup instructions
- [ ] Demo video (<3 minutes) ← record with `./scripts/demo-flow.sh`
- [ ] Live demo link
- [x] Protocol features / SDKs explained (table above)
- [ ] Team member names + contact info (Telegram, X)
- [x] Working example agent (`examples/goal-agent/src/agent-0g.mjs`)
- [x] Architecture diagram (above + `examples/goal-agent/ARCHITECTURE.md`)

## Steps to Complete Before Submitting

1. **Deploy contract**
   ```bash
   cd contracts
   npm install
   cp .env.example .env        # add OG_PRIVATE_KEY
   npm run deploy:testnet      # outputs contract address
   ```
   → paste address above and in `.env`

2. **Test 0G Storage sync**
   ```bash
   export OG_STORAGE_ENABLED=1
   export OG_STORAGE_INDEXER_RPC=https://indexer-storage-testnet-standard.0g.ai
   export OG_PRIVATE_KEY=<key>
   export OG_REGISTRY_CONTRACT=<address>
   og init --template react-vite --dir /tmp/test-app --yes
   og sync push
   ```

3. **Record demo video** (<3 min)
   - Show: `og create` → diff → apply → `og sync push` → 0G Storage tx
   - Show: `agent-0g.mjs` run with reflection output

4. **Add team info** (Telegram, X handles)

## Submission Template (Copy/Paste)

```
Project name: 0G Forge
Track: Best Agent Framework, Tooling & Core Extensions

Short description:
0G Forge is a terminal-native agent framework and CLI for prompt-driven
app creation on the 0G stack. Developers use `og create/edit/deploy/sync`
to build AI-generated apps powered by 0G Compute inference, persist
metadata to 0G Storage, and register framework entries on 0G Chain.
The included goal agent demonstrates autonomous multi-step app building
with reflection loops and cross-machine memory via 0G Storage.

Protocol features used:
- 0G Compute Network: all AI inference (og create / og edit)
- 0G Storage Indexer: project sync payload persistence (og sync push/pull)
- 0G Chain (EVM): FrameworkRegistry contract for on-chain sync hash + framework registration

Contract deployment addresses:
- FrameworkRegistry: `0x495F79138BEc9c6241eC2fAC1524AB3e9214832E` (0G Chain Galileo Testnet, chainId 16602)

GitHub: https://github.com/karagozemin/0g-forge
Demo video: TBD
Live demo: TBD

Team:
- TBD (Telegram: @TBD, X: @TBD)
```
