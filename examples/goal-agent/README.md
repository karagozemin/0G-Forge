# Goal Agent Example

This is a minimal autonomous single-agent example for 0G hackathon submissions.

The agent:
- logs in through `og` CLI (mock endpoint by default)
- initializes a project
- executes a goal loop (`create` then `edit` prompts)
- persists run memory to `examples/goal-agent/state/memory.json`
- keeps an append-only local memory trail for each decision step

## Why this helps both tracks

- **Track A (Framework/Tooling):** demonstrates a working agent built on top of your framework tooling (`og` command surface).
- **Track B (Autonomous Agents):** demonstrates an autonomous goal-driven loop with persistent memory and repeatable execution.

## Prerequisites

- Node.js >= 18
- `pnpm`
- Repo dependencies installed (`pnpm install` at repo root)

## Quick Start

From repo root:

```bash
pnpm --dir ./examples/goal-agent run smoke
```

Run a 3-goal dry-run loop:

```bash
pnpm --dir ./examples/goal-agent run start
```

Run in apply mode (writes files into demo project):

```bash
pnpm --dir ./examples/goal-agent run run:apply
```

## CLI Options

`node ./src/agent.mjs [options]`

- `--apply` apply file changes instead of dry-run
- `--max-steps <n>` number of goal iterations (default: `3`)
- `--template <id>` template for `og init` (default: `react-vite`)
- `--project-dir <path>` target project directory (default: `.demo/goal-agent-app`)

## Output

- Memory log: `examples/goal-agent/state/memory.json`
- Demo project path: `.demo/goal-agent-app` (default)

## Suggested Demo Narrative (60–90s)

1. Run `pnpm --dir ./examples/goal-agent run smoke`
2. Show automatic `login -> init -> create/edit` goal loop
3. Open `examples/goal-agent/state/memory.json` as persistent memory evidence
4. Mention this same pattern can be extended to swarms
