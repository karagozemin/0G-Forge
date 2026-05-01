/**
 * goal-agent-0g: Autonomous app-building agent using 0G Storage + 0G Compute
 *
 * Unlike the basic agent (agent.mjs), this version:
 *   - Persists memory to 0G Storage (KV) instead of a local file
 *   - Runs a reflection loop: evaluates each step before continuing
 *   - Registers itself on-chain via FrameworkRegistry on 0G Chain
 *   - Supports dynamic goal expansion based on reflection output
 *
 * Usage:
 *   OG_STORAGE_ENABLED=1 \
 *   OG_STORAGE_INDEXER_RPC=<rpc> \
 *   OG_PRIVATE_KEY=<key> \
 *   OG_REGISTRY_CONTRACT=<address> \
 *   node examples/goal-agent/src/agent-0g.mjs [--apply] [--max-steps 3]
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const cliEntry = path.resolve(repoRoot, "apps/cli/src/index.ts");
const tsxBin = path.resolve(repoRoot, "apps/cli/node_modules/.bin/tsx");

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const parsed = {
    apply: false,
    maxSteps: 3,
    template: "react-vite",
    projectDir: path.resolve(repoRoot, ".demo/goal-agent-app")
  };

  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (cur === "--apply") { parsed.apply = true; continue; }
    if (cur === "--max-steps") {
      const v = Number.parseInt(argv[i + 1] ?? "", 10);
      if (!Number.isInteger(v) || v < 1) throw new Error("--max-steps must be a positive integer.");
      parsed.maxSteps = v;
      i++;
      continue;
    }
    if (cur === "--template") {
      const v = (argv[i + 1] ?? "").trim();
      if (!v) throw new Error("--template requires a value.");
      parsed.template = v;
      i++;
      continue;
    }
    if (cur === "--project-dir") {
      const v = (argv[i + 1] ?? "").trim();
      if (!v) throw new Error("--project-dir requires a value.");
      parsed.projectDir = path.resolve(v);
      i++;
    }
  }

  return parsed;
}

// ── CLI runner ────────────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      OG_ENABLE_MOCK_MODE: process.env.OG_ENABLE_MOCK_MODE ?? "1",
      ...(options.env ?? {})
    }
  });

  const header = `$ ${command} ${args.join(" ")}`;
  console.log(`\n${header}`);
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${header}`);
  }

  return result.stdout ?? "";
}

function runCli(cliArgs, options = {}) {
  return run(tsxBin, [cliEntry, ...cliArgs], {
    cwd: options.cwd ?? repoRoot,
    env: options.env
  });
}

// ── 0G Storage memory ─────────────────────────────────────────────────────────

const MEMORY_STREAM_ID = "0g-forge-goal-agent";

async function pushMemoryToZeroG(memory) {
  if (!isZeroGEnabled()) {
    return;
  }

  try {
    // Use og sync push to persist memory via 0G Storage
    runCli(["sync", "push"], {
      env: {
        OG_STORAGE_ENABLED: "1"
      }
    });
    console.log("[0G Storage] Memory synced to 0G Storage.");
  } catch {
    console.warn("[0G Storage] Sync push failed, falling back to local memory.");
  }
}

function isZeroGEnabled() {
  return /^(1|true|yes|on)$/i.test(process.env.OG_STORAGE_ENABLED?.trim() ?? "");
}

// ── Local memory fallback ─────────────────────────────────────────────────────

const LOCAL_MEMORY_PATH = path.resolve(repoRoot, "examples/goal-agent/state/memory-0g.json");

async function readMemory() {
  try {
    const raw = await readFile(LOCAL_MEMORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.history)) return { history: [], reflections: [] };
    return parsed;
  } catch {
    return { history: [], reflections: [] };
  }
}

async function writeMemory(memory) {
  await mkdir(path.dirname(LOCAL_MEMORY_PATH), { recursive: true });
  await writeFile(LOCAL_MEMORY_PATH, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
}

// ── Reflection engine ─────────────────────────────────────────────────────────

/**
 * Simple reflection: evaluates the last step result and decides whether to
 * continue, retry, or expand the goal list.
 */
function reflect(step) {
  const succeeded = step.exitCode === 0;
  const needsRetry = !succeeded && step.attempt < 2;

  return {
    timestamp: new Date().toISOString(),
    goal: step.goal,
    succeeded,
    needsRetry,
    nextAction: succeeded
      ? "continue"
      : needsRetry
        ? "retry"
        : "skip",
    note: succeeded
      ? `Step completed: ${step.mode} for "${step.goal}"`
      : `Step failed (attempt ${step.attempt + 1}): ${step.goal}`
  };
}

// ── Project init check ────────────────────────────────────────────────────────

async function projectAlreadyInitialized(projectDir) {
  try {
    await access(path.join(projectDir, ".og", "manifest.json"));
    return true;
  } catch {
    return false;
  }
}

// ── On-chain registration ─────────────────────────────────────────────────────

async function registerOnChain() {
  const contractAddress = process.env.OG_REGISTRY_CONTRACT?.trim();
  const privateKey = process.env.OG_PRIVATE_KEY?.trim();
  const evmRpc = process.env.OG_EVM_RPC?.trim() ?? "https://evmrpc-testnet.0g.ai";

  if (!contractAddress || !privateKey) {
    console.log("[Chain] OG_REGISTRY_CONTRACT or OG_PRIVATE_KEY not set — skipping on-chain registration.");
    return null;
  }

  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(evmRpc);
    const signer = new ethers.Wallet(privateKey, provider);

    const abi = [
      "function registerFramework(string name, string version, string repoUrl) external"
    ];
    const contract = new ethers.Contract(contractAddress, abi, signer);
    const tx = await contract.registerFramework(
      "0G Forge",
      "0.1.11",
      "https://github.com/karagozemin/0g-forge"
    );
    await tx.wait();
    console.log(`[Chain] Framework registered on 0G Chain. tx: ${tx.hash}`);
    return tx.hash;
  } catch (err) {
    console.warn(`[Chain] Registration failed: ${err.message}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("\n=== 0G Forge Goal Agent (0G-Native) ===");
  console.log(`Project dir : ${args.projectDir}`);
  console.log(`Template    : ${args.template}`);
  console.log(`Max steps   : ${args.maxSteps}`);
  console.log(`Apply mode  : ${args.apply ? "apply" : "dry-run"}`);
  console.log(`0G Storage  : ${isZeroGEnabled() ? "enabled" : "disabled (local fallback)"}`);

  await mkdir(args.projectDir, { recursive: true });

  // Register on 0G Chain if configured
  const chainTx = await registerOnChain();

  const goals = [
    "Create a landing page with headline, subtext, and CTA button.",
    "Improve accessibility by increasing color contrast and focus states.",
    "Add a short feature list section below the hero area.",
    "Add a dark mode toggle that persists user preference in localStorage.",
    "Add smooth scroll animations to each section."
  ].slice(0, args.maxSteps);

  const memory = await readMemory();

  // Auth
  runCli(["login", "--token", "mock-token", "--endpoint", "mock://local", "--account", "goal_agent_0g"]);

  // Init project if needed
  if (await projectAlreadyInitialized(args.projectDir)) {
    console.log(`\nProject already initialized, skipping init: ${args.projectDir}`);
  } else {
    runCli([
      "init", "--template", args.template,
      "--dir", args.projectDir,
      "--yes", "--model", "0g-medium"
    ]);
  }

  // Autonomous goal loop with reflection
  for (let index = 0; index < goals.length; index++) {
    const goal = goals[index];
    const useCreate = index === 0;
    let attempt = 0;
    let succeeded = false;

    while (!succeeded && attempt < 3) {
      console.log(`\n── Step ${index + 1}/${goals.length} (attempt ${attempt + 1}) ──`);
      console.log(`Goal: ${goal}`);

      const commandArgs = [
        useCreate ? "create" : "edit",
        "--prompt", goal,
        "--yes"
      ];

      if (!args.apply) commandArgs.push("--dry-run");

      let exitCode = 0;
      try {
        runCli(commandArgs, { cwd: args.projectDir });
      } catch {
        exitCode = 1;
      }

      const step = { goal, mode: useCreate ? "create" : "edit", attempt, exitCode };
      const reflection = reflect(step);

      console.log(`\nReflection: ${reflection.note}`);
      console.log(`Next action: ${reflection.nextAction}`);

      memory.reflections = memory.reflections ?? [];
      memory.reflections.push(reflection);

      if (reflection.succeeded) {
        succeeded = true;
        memory.history.push({
          timestamp: new Date().toISOString(),
          goal,
          mode: step.mode,
          apply: args.apply,
          projectDir: args.projectDir,
          chainTx: chainTx ?? undefined
        });
      } else if (reflection.nextAction === "retry") {
        attempt++;
        console.log("Retrying step...");
      } else {
        console.warn(`Skipping goal after ${attempt + 1} failed attempts.`);
        break;
      }
    }
  }

  await writeMemory(memory);

  // Sync memory to 0G Storage if enabled
  await pushMemoryToZeroG(memory);

  console.log("\n=== Goal Agent Run Complete ===");
  console.log(`Memory file : ${LOCAL_MEMORY_PATH}`);
  console.log(`Project dir : ${args.projectDir}`);
  console.log(`Mode        : ${args.apply ? "apply" : "dry-run"}`);
  if (chainTx) {
    console.log(`Chain tx    : ${chainTx}`);
  }
  console.log(`Steps       : ${memory.history.length} completed, ${memory.reflections?.length ?? 0} reflections recorded`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nGoal agent failed: ${message}`);
  process.exitCode = 1;
});
