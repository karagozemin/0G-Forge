# Goal Agent Architecture

```mermaid
flowchart TD
    A[Goal Queue] --> B[Autonomous Loop Controller]
    B --> C[og login]
    B --> D[og init]
    B --> E[og create or og edit]
    E --> F[Plan + Diff]
    F --> G[Apply or Dry-Run]
    G --> H[Local Memory File]
    H --> B
```

## Components

- **Loop Controller:** `examples/goal-agent/src/agent.mjs`
- **Framework Tooling:** `apps/cli/src/index.ts`
- **Compute Integration:** `packages/compute-client/src/compute-client.ts`
- **Memory/Sync Layer:** `packages/storage/src/index.ts`

## Autonomous Behavior

- Reads goal list
- Chooses create/edit phase automatically by iteration index
- Executes task through the framework commands
- Writes memory after each step
- Pushes metadata sync after each step
