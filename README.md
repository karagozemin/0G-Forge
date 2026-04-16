# og terminal builder

Terminal-native companion CLI for building and iterating 0G app projects from prompts, then previewing, deploying, and syncing project metadata.

## What this tool does

`og` helps you run a lightweight app-builder workflow from your terminal:

- initialize a project from a supported template
- authenticate against a compute endpoint
- generate (`create`) or modify (`edit`) files via prompt-driven plan/diff/apply flow
- run local preview with template-aware commands
- deploy to Vercel
- sync lightweight project metadata (`.og` state + artifact metadata)

## Current MVP features

- `og login`, `og logout`, `og whoami`
- `og model list`, `og model use <modelId>`
- `og init --template <id> --dir <path> --yes`
- `og create --prompt "..." [--template <id>] [--model <id>] [--dry-run] [--yes]`
- `og edit --prompt "..." [--model <id>] [--dry-run] [--yes]`
- `og preview [--port <number>] [--open]`
- `og deploy vercel [--prod] [--yes]`
- `og sync push` / `og sync pull`

Supported templates:

- `react-vite`
- `nextjs-app`
- `static-landing`

Supported deploy target:

- `vercel`

Sync behavior in v1:

- lightweight metadata sync only (manifest, history entries, artifact metadata)

## Monorepo structure

```text
apps/
  cli/                 # og CLI entrypoint and command wiring
packages/
  core/                # .og manifest/history schema + helpers
  compute-client/      # auth storage and compute model/auth client
  deploy-vercel/       # deploy package placeholder for Vercel integration boundary
  storage/             # sync provider abstraction + local-file provider
templates/
  react-vite/
  nextjs-app/
  static-landing/
```

## Prerequisites

- Node.js
- pnpm (workspace uses `pnpm`)
- Vercel CLI (`vercel`) for deploy commands

## Installation

```bash
git clone <your-fork-or-this-repo-url>
cd 0G
pnpm install
```

## Local development

Run checks from repo root:

```bash
pnpm build
pnpm lint
pnpm typecheck
```

Run the CLI from source during development:

```bash
pnpm --filter @og/cli dev --help
```

Run an actual command from source:

```bash
pnpm --filter @og/cli dev init --template react-vite --dir ./tmp/my-app --yes
```

## CLI command overview

```text
og doctor
og login [--token <token>] [--endpoint <url>] [--account <id>]
og logout
og whoami

og model list
og model use <modelId>

og init [--template <id>] [--dir <path>] [--model <id>] [--yes]
og create --prompt <text> [--template <id>] [--model <id>] [--dry-run] [--yes]
og edit --prompt <text> [--model <id>] [--dry-run] [--yes]

og preview [--port <number>] [--open]
og deploy vercel [--prod] [--yes]

og sync push
og sync pull
```

## Example workflows

### 1) Login

```bash
pnpm --filter @og/cli dev login --token "$OG_COMPUTE_TOKEN"
pnpm --filter @og/cli dev whoami
pnpm --filter @og/cli dev model list
```

### 2) Initialize project

```bash
pnpm --filter @og/cli dev init --template react-vite --dir ./demo/react-app --yes
cd ./demo/react-app
pnpm install
```

### 3) Create from prompt

```bash
pnpm --filter @og/cli dev create --prompt "Build a simple task app UI" --dry-run
pnpm --filter @og/cli dev create --prompt "Build a simple task app UI" --yes
```

### 4) Edit from prompt

```bash
pnpm --filter @og/cli dev edit --prompt "Add a dark mode toggle" --dry-run
pnpm --filter @og/cli dev edit --prompt "Add a dark mode toggle" --yes
```

### 5) Preview

```bash
pnpm --filter @og/cli dev preview --port 4173
```

### 6) Deploy to Vercel

```bash
pnpm --filter @og/cli dev deploy vercel
# or production deploy
pnpm --filter @og/cli dev deploy vercel --prod --yes
```

### 7) Sync metadata

```bash
pnpm --filter @og/cli dev sync push
pnpm --filter @og/cli dev sync pull
```

## Local state and data

Inside each initialized project:

- `.og/manifest.json`: project metadata (`projectName`, `template`, `defaultModel`, `deployTarget`, etc.)
- `.og/history.ndjson`: append-only history lines for key actions/state updates
- `.og/artifacts-metadata.json`: written on `sync pull` with remote artifact metadata snapshot

User-level config (macOS/Linux default path):

- `~/.config/og/auth.json`: saved compute auth state
- `~/.config/og/sync-store.json`: local-file sync provider store

## Architecture notes

- `create`/`edit` run through a reusable provider-based pipeline (`GenerationProvider`).
- Current CLI wiring uses `ComputeGenerationProvider`.
- If compute endpoint is not HTTP(S), generation falls back to a local mock plan path.
- Sync uses a storage abstraction (`SyncProvider`) with a default local-file provider.

## v1 limitations

- Templates are limited to `react-vite`, `nextjs-app`, and `static-landing`.
- Deploy target is Vercel only.
- Sync is metadata-focused, not full project backup/restore.
- No long-running background daemon/watcher for sync.
- Conflict handling is intentionally minimal (safe merge for history + manifest replacement from pulled payload).

## Suggested next roadmap items

- richer conflict detection/resolution for sync
- remote sync backend provider(s) beyond local-file
- improved generation/evaluation loop with test-aware edits
- deployment targets beyond Vercel
- command-level automated tests and CI workflow

## Troubleshooting

### `No initialized og project found...`

Run commands like `create`, `edit`, `preview`, `deploy`, and `sync` from inside an initialized project directory (or a child directory under it). If needed:

```bash
pnpm --filter @og/cli dev init --template react-vite --dir ./my-app --yes
cd ./my-app
```

### `Not logged in. Run og login first.`

Authenticate before model/generation commands:

```bash
pnpm --filter @og/cli dev login --token "$OG_COMPUTE_TOKEN"
```

### Deploy command fails

- Ensure `vercel` CLI is installed and available in `PATH`.
- Ensure you are logged in with `vercel login`.
- Ensure project `deployTarget` is `vercel` in `.og/manifest.json`.

### `sync pull` says no remote payload

Run `sync push` at least once for the same initialized project key before pulling.
