# 0G Forge

![0G Forge Logo](./public/0G-Forge-Logo.jpeg)

`0G Forge` is a terminal-native companion for the 0G app workflow: prompt-driven project changes, local preview, Vercel deploy, and lightweight sync metadata.

This repository is a working MVP focused on builder workflow speed and inspectability from the terminal.

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
- Node.js
- `pnpm`
- `vercel` CLI (for deploy commands)

### Install + build

```bash
git clone <repo-url>
cd 0G
pnpm install
pnpm build
```

### Run CLI from source

```bash
pnpm --filter @og/cli run dev --help
```

### 60–120 second demo

```bash
./scripts/demo-flow.sh --mode mock
```

For real proxy demo commands and speaking notes, see `DEMO.md`.

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
- metadata sync push/pull via configured sync provider abstraction (default local-file)

**Mock path**
- when endpoint is `mock://local`, generation uses deterministic local mock planning

## Current limitations (truthful)

- Real-provider generation can still fail due to timeout/rate limits.
- Deploy target is Vercel only.
- Sync is lightweight metadata sync, not full project backup/restore.
- Template set is intentionally narrow.

## Repository map

```text
apps/cli/              # CLI implementation, packaging, runtime wiring
packages/core/         # .og state schema/helpers
packages/compute-client/ # auth + model/endpoint client
packages/storage/      # sync provider abstraction + local-file provider
templates/             # starter templates copied by `og init`
scripts/demo-flow.sh   # reproducible short demo runner
```

## Where reviewers should look next

- `DEMO.md`: exact live demo sequence (real + fallback)
- `SHOWCASE.md`: concise judge-facing snapshot (what works, limits, value)

## Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm build
```
