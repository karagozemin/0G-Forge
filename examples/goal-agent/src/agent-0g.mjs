/**
 * 0G Forge Goal Agent — powered by @og/forge-agent runtime
 *
 * Demonstrates the forge-agent framework (ZeroClaw-style alternative) built on 0G:
 *   - ToolRegistry: registers og CLI tools (og:create, og:edit, og:sync)
 *   - MemoryLayer:  persists agent state to local file (or 0G Storage)
 *   - AgentLoop:    executes goals with built-in reflection (continue/retry/skip)
 *
 * Usage:
 *   node examples/goal-agent/src/agent-0g.mjs [--apply] [--max-steps 3]
 *
 * With 0G Storage:
 *   OG_STORAGE_ENABLED=1 OG_PRIVATE_KEY=<key> OG_REGISTRY_CONTRACT=<addr> \
 *   node examples/goal-agent/src/agent-0g.mjs --apply
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const cliEntry = path.resolve(repoRoot, "apps/cli/src/index.ts");
const tsxBin = path.resolve(repoRoot, "apps/cli/node_modules/.bin/tsx");

// ── Parse args ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { apply: false, maxSteps: 3, template: "react-vite", projectDir: path.resolve(repoRoot, ".demo/goal-agent-app") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") { out.apply = true; continue; }
    if (argv[i] === "--max-steps") { out.maxSteps = Number.parseInt(argv[++i], 10); continue; }
    if (argv[i] === "--template") { out.template = argv[++i]; continue; }
    if (argv[i] === "--project-dir") { out.projectDir = path.resolve(argv[++i]); }
  }
  return out;
}

// ── CLI helper ────────────────────────────────────────────────────────────────

function runCli(cliArgs, cwd = repoRoot) {
  const result = spawnSync(tsxBin, [cliEntry, ...cliArgs], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, OG_ENABLE_MOCK_MODE: process.env.OG_ENABLE_MOCK_MODE ?? "1" }
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (output) console.log(output);
  return result.status === 0;
}

// ── On-chain registration ─────────────────────────────────────────────────────

async function registerOnChain() {
  const contractAddress = process.env.OG_REGISTRY_CONTRACT?.trim();
  const privateKey = process.env.OG_PRIVATE_KEY?.trim();
  if (!contractAddress || !privateKey) return null;

  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(process.env.OG_EVM_RPC ?? "https://evmrpc-testnet.0g.ai");
    const signer = new ethers.Wallet(privateKey, provider);
    const abi = ["function registerFramework(string name, string version, string repoUrl) external"];
    const contract = new ethers.Contract(contractAddress, abi, signer);
    const tx = await contract.registerFramework("0G Forge", "0.1.11", "https://github.com/karagozemin/0g-forge");
    await tx.wait();
    console.log(`[Chain] Framework registered. tx: ${tx.hash}`);
    return tx.hash;
  } catch (err) {
    console.warn(`[Chain] Registration failed: ${err.message}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Import forge-agent runtime (tsx resolves TypeScript workspace packages)
  const forgeAgentPath = path.resolve(repoRoot, "packages/forge-agent/src/index.ts");
  const {
    AgentLoop,
    ToolRegistry,
    MemoryLayer,
    createLocalMemoryBackend,
    createOgCreateTool,
    createOgEditTool,
    createOgSyncTool
  } = await import(forgeAgentPath);

  console.log("\n=== 0G Forge Agent Runtime ===");
  console.log(`Project dir : ${args.projectDir}`);
  console.log(`Apply mode  : ${args.apply ? "apply" : "dry-run"}`);
  console.log(`0G Storage  : ${process.env.OG_STORAGE_ENABLED === "1" ? "enabled" : "local fallback"}`);

  await mkdir(args.projectDir, { recursive: true });

  // 1. Auth + init
  runCli(["login", "--token", "mock-token", "--endpoint", "mock://local", "--account", "forge_agent"]);
  const alreadyInit = await import("node:fs/promises").then(({ access }) =>
    access(path.join(args.projectDir, ".og", "manifest.json")).then(() => true).catch(() => false)
  );
  if (!alreadyInit) {
    runCli(["init", "--template", args.template, "--dir", args.projectDir, "--yes", "--model", "0g-medium"]);
  } else {
    console.log(`\nProject already initialized: ${args.projectDir}`);
  }

  // 2. Register on 0G Chain
  const chainTx = await registerOnChain();

  // 3. Build tool registry
  const toolOptions = { cliEntry, tsxBin, projectDir: args.projectDir, apply: args.apply };
  const registry = new ToolRegistry()
    .register(createOgCreateTool(toolOptions))
    .register(createOgEditTool(toolOptions))
    .register(createOgSyncTool({ cliEntry, tsxBin, projectDir: args.projectDir }));

  // 4. Memory layer
  const memoryPath = path.resolve(repoRoot, "examples/goal-agent/state/forge-memory.json");
  const memory = new MemoryLayer(createLocalMemoryBackend(memoryPath), "goal-agent");

  // 5. Define goals
  const allGoals = [
    { goal: "Create a landing page with headline, subtext, and CTA button.", tool: "og:create" },
    { goal: "Improve accessibility by increasing color contrast and focus states.", tool: "og:edit" },
    { goal: "Add a short feature list section below the hero area.", tool: "og:edit" },
    { goal: "Add a dark mode toggle that persists in localStorage.", tool: "og:edit" },
    { goal: "Add smooth scroll animations to each section.", tool: "og:edit" }
  ].slice(0, args.maxSteps);

  // 6. Build and run agent loop
  const loop = new AgentLoop({
    registry,
    memory,
    maxRetries: 2,
    onStepStart(step, attempt) {
      console.log(`\n── Goal ${attempt === 0 ? "" : `(retry ${attempt}) `}: ${step.goal}`);
    },
    onStepEnd(reflection) {
      console.log(`   ↳ ${reflection.decision.toUpperCase()}: ${reflection.note}`);
    }
  });

  for (const { goal, tool } of allGoals) {
    loop.addGoal(goal, tool);
  }

  const result = await loop.run();

  // 7. Sync memory to 0G Storage if enabled
  if (process.env.OG_STORAGE_ENABLED === "1") {
    console.log("\n[0G Storage] Syncing memory...");
    runCli(["sync", "push"], args.projectDir);
  }

  console.log("\n=== Run Complete ===");
  console.log(`Goals   : ${result.goalsCompleted}/${result.goalsTotal} completed, ${result.goalsSkipped} skipped`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`Memory  : ${memoryPath}`);
  if (chainTx) console.log(`Chain tx: ${chainTx}`);
}

main().catch((err) => {
  console.error(`\nAgent failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
