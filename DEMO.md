# Demo Script (60–120 seconds)

This walkthrough is optimized for a short live judge/demo session and uses the current CLI behavior as-is.

For copy/paste consistency, this walkthrough uses:

```bash
REPO_ROOT="$(pwd)"
```

## 0) Setup (10–15s)

```bash
cd "$REPO_ROOT"
pnpm install
pnpm build
```

Optional env setup:

```bash
export OG_REAL_TOKEN="<your-real-proxy-token>"
export OG_ENDPOINT="https://compute-network-4.integratenetwork.work/v1/proxy"
```

## 1) Login (10–15s)

```bash
pnpm --filter @og/cli run dev login --token "$OG_REAL_TOKEN" --endpoint "$OG_ENDPOINT"
pnpm --filter @og/cli run dev whoami
```

What to call out:
- account + endpoint are shown
- validation mode is explicit (`proxy` or `local`)

## 2) Init (10–15s)

```bash
tmp=$(mktemp -d)
pnpm --filter @og/cli run dev init --template react-vite --dir "$tmp/react" --model deepseek/deepseek-chat-v3-0324 --yes
cd "$tmp/react"
pnpm install
```

What to call out:
- selected template + model are printed clearly
- next-step hints are shown by CLI

## 3) Create dry-run (20–30s)

```bash
pnpm --dir "$REPO_ROOT" --filter @og/cli run dev create \
  --prompt "Add a hero section with headline, short subtext, and CTA" \
  --dry-run \
  --yes
```

What to call out:
- plan summary (`model`, `template`, file counts)
- diff preview before write
- no files written in dry-run mode

## 4) Preview (10–15s)

```bash
pnpm --dir "$REPO_ROOT" --filter @og/cli run dev preview --port 4173
```

What to call out:
- preview command + URL are shown
- terminal-native flow (no dashboard dependency)

## 5) Deploy + Sync (20–30s)

```bash
pnpm --dir "$REPO_ROOT" --filter @og/cli run dev deploy vercel --yes
pnpm --dir "$REPO_ROOT" --filter @og/cli run dev sync push
```

What to call out:
- deployment URL extraction
- sync provider + target + counts

## Fallback line for live demos

If real provider is slow/rate-limited, switch to mock mode to keep the demo deterministic:

```bash
pnpm --filter @og/cli run dev login --token mock-token --endpoint mock://local
```

Then run the same `init -> create --dry-run -> preview` sequence.

Optional one-command demo helper:

```bash
./scripts/demo-flow.sh --mode mock
```
