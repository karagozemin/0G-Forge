<div align="center">
  <h1>0G Forge</h1>

  <p><strong>0G Forge</strong> is a terminal-native companion for the 0G app workflow: prompt-driven project changes, local preview, Vercel deploy, and lightweight sync metadata.</p>
  
  <p>This repository is a working MVP focused on builder workflow speed and inspectability from the terminal.</p>
</div>

## Install (Public npm)

```bash
npm install -g @kaptan_web3/og-cli
og --version
og --help
```

If you see `EEXIST` for `og`:

```bash
npm uninstall -g @og/cli
npm install -g @kaptan_web3/og-cli
```

## 2-minute reviewer overview

**Problem:** builders lose time switching between tools for generation, local run, deploy, and state handoff.

**What this project does:** keeps that loop in one CLI with explicit plan/diff output and actionable runtime messages.

**Implemented today:**
- auth/session: `og login`, `og logout`, `og whoami`
- model controls: `og model list`, `og model use <modelId>`
- project lifecycle: `og init`, `og create`, `og edit`
- runtime/deploy: `og preview`, `og deploy vercel`
- metadata handoff: `og sync push`, `og sync pull`

## Submission framing (judge/hackathon)

**What is unique here**
- terminal-first, prompt-to-app flow with plan/diff before apply
- real proxy-compatible generation path + deterministic mock fallback
- deploy + lightweight sync included in the same command surface

**Why it matters for builders**
- shortens idea-to-running-app iteration in terminal
- keeps generated changes inspectable and controlled
- keeps project state portable without introducing heavy infra

**Why it fits 0G / 0G App**
- integrates with OpenAI-compatible 0G compute proxy endpoints
- stays focused on practical app-building and shipping workflows

## Quick start

### Prerequisites

Per-command requirements — start with zero setup and add as you go:

| Command | Requirement |
|---|---|
| `og init`, `og preview` | Node.js ≥ 18 only |
| `og create` / `og edit` | Token for any OpenAI-compatible endpoint (e.g. a 0G Compute proxy) |
| `og sync push/pull` (0G mode) | 0G mainnet wallet with a small balance; set `OG_STORAGE_ENABLED=1` + `OG_PRIVATE_KEY` |
| `og deploy vercel` | `vercel` CLI installed and logged in |

Without `OG_STORAGE_ENABLED=1`, sync uses a local-file provider and needs no wallet. `pnpm` is only needed to run from source.

### Install globally from npm (recommended)

```bash
npm install -g @kaptan_web3/og-cli
og --version
og --help
```

If you see `EEXIST` for `og`, remove the old global package and reinstall:

```bash
npm uninstall -g @og/cli
npm install -g @kaptan_web3/og-cli
```

### Run from source (contributors)

```bash
git clone <repo-url>
cd 0G
pnpm install
pnpm build
pnpm --filter @og/cli run dev --help
```

### 60–120 second demo

```bash
./scripts/demo-flow.sh --mode mock
```

For real proxy demo commands and speaking notes, see `DEMO.md`.

## How builders use this (practical flow)

### 1) Login (real endpoint)

```bash
og login \
  --token "$OG_REAL_TOKEN" \
  --endpoint "https://compute-network-4.integratenetwork.work/v1/proxy"
```

### 2) Initialize a project

```bash
og init --template react-vite --dir ./my-app --yes
cd ./my-app
pnpm install
```

### 3) Generate changes from a prompt (safe first run)

```bash
og create \
  --prompt "Add a hero section" \
  --dry-run \
  --yes
```

### 4) Apply and iterate

```bash
og create --prompt "Add a hero section" --yes
og edit --prompt "Improve spacing and CTA contrast" --dry-run --yes
```

### 5) Preview, deploy, sync

```bash
og preview --port 4173
og deploy vercel --yes
og sync push
```

### Notes for first-time users

- `og model list` discovers the model ids your provider actually accepts, even on proxies without a `/models` catalog.
- If your default model is not supported by the provider, `og create`/`og edit` automatically retries with a provider-accepted model and tells you which one was used.
- If you see timeout/rate-limit errors in real mode, retry with a short cooldown; the generation timeout defaults to 120s and can be tuned with `OG_GENERATION_TIMEOUT_MS`.
- `create` and `edit` are easiest to start with `--dry-run` so you can inspect plan and diff output before writing files.
- Upgrade globally with `npm install -g @kaptan_web3/og-cli@latest`.
- Remove globally with `npm uninstall -g @kaptan_web3/og-cli`.

## Core command surface (MVP)

```text
og login / logout / whoami
og model list / model use <modelId>
og init
og create / og edit
og preview
og deploy vercel
og sync push / og sync pull
```

Supported templates: `react-vite`, `nextjs-app`, `static-landing`.

## Real vs mock boundaries

**Real path**
- auth and identity validation against real proxy endpoint
- generation requests to OpenAI-compatible proxy routes
- local preview execution
- Vercel deployment flow
- metadata sync push/pull: local-file provider by default, real 0G Storage + 0G Chain with `OG_STORAGE_ENABLED=1` and `OG_PRIVATE_KEY`

**Mock path**
- mock endpoints are disabled by default for end users
- local mock mode is developer-only opt-in: set `OG_ENABLE_MOCK_MODE=1` before using `mock://local`

## Current limitations (truthful)

During real provider usage, generation calls may intermittently fail due to upstream capacity conditions (for example `429` rate limits or concurrent request caps). The CLI includes bounded retries, prompt-context budgeting for large projects, automatic model fallback, and clearer diagnostics — but end-to-end success still depends on live provider availability at request time.

- Real-provider generation can still fail under upstream rate limits.
- Deploy target is Vercel only (requires the `vercel` CLI installed and logged in).
- Sync is lightweight metadata sync, not full project backup/restore.
- Template set is intentionally narrow.

## Repository map

```text
apps/cli/              # CLI implementation, packaging, runtime wiring
packages/core/         # .og state schema/helpers
packages/compute-client/ # auth + model/endpoint client
packages/storage/      # sync provider abstraction + local-file provider
packages/storage-0g/   # 0G Storage + 0G Chain sync provider
packages/forge-agent/  # agent runtime (AgentLoop, ToolRegistry, MemoryLayer)
contracts/             # FrameworkRegistry.sol — deployed on 0G mainnet
templates/             # starter templates copied by `og init`
examples/goal-agent/   # autonomous agent example built on top of og
scripts/demo-flow.sh   # reproducible short demo runner
```

## Where reviewers should look next

- `DEMO.md`: exact live demo sequence (real + fallback)
- `SHOWCASE.md`: concise judge-facing snapshot (what works, limits, value)
- `HACKATHON_SUBMISSION.md`: dual-track submission checklist and payload template
- `examples/goal-agent/`: working autonomous agent example built on top of `og`

## Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm build
```
