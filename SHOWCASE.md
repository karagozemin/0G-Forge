# Showcase Snapshot

## What this is

`og` is a terminal-native companion to the 0G app flow.
It helps builders go from prompt to project changes, preview locally, deploy to Vercel, and sync lightweight project metadata.

## Why it matters for builders

- Keeps app iteration in one CLI workflow (no context switching to dashboards).
- Makes changes inspectable via plan + diff before apply.
- Supports real proxy-based generation paths while preserving a deterministic mock fallback.

## 3 key product points

1. **Prompt-to-app workflow in terminal**
   - `og create` / `og edit` produce structured plans and diffs.
2. **Real integration path**
   - Works with real OpenAI-compatible 0G proxy endpoints for generation.
3. **Ship + carry state**
   - `og deploy vercel` + `og sync push/pull` covers lightweight deployment + metadata portability.

## 90-second demo path

1. `og login` (real proxy token + endpoint)
2. `og init --template react-vite --yes`
3. `og create --prompt "..." --dry-run --yes`
4. `og preview`
5. `og deploy vercel --yes`
6. `og sync push`

See `DEMO.md` for exact commands.

## What is real vs mocked

- **Real**
  - CLI command surface and runtime flow
   - real proxy auth/identity path
   - generation requests to OpenAI-compatible proxy routes
  - deploy via Vercel CLI
  - metadata sync push/pull
- **Mocked/fallback**
  - generation plan path when endpoint is `mock://local`

## Current limitations / tradeoffs

- Provider timeouts or rate limits can still occur on real endpoints.
- Under heavy load, upstream may also close sockets mid-request; CLI retries and diagnostics were improved, but final success still depends on live provider availability.
- Template set is intentionally small (`react-vite`, `nextjs-app`, `static-landing`).
- Deploy target is currently Vercel only.
- Sync is lightweight metadata sync, not full project backup/restore.
- Overall scope is MVP/demo-grade, not a production-hardened platform.

## Judge quick-read checklist

- **Unique angle:** terminal-first 0G builder companion with diff-first edits.
- **Already works:** auth, init, create/edit dry-run, preview, deploy, sync.
- **Realistic constraints:** provider latency/rate limits are surfaced with actionable CLI guidance.
