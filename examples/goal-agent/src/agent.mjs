import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const cliEntry = path.resolve(repoRoot, "apps/cli/src/index.ts");
const tsxBin = path.resolve(repoRoot, "apps/cli/node_modules/.bin/tsx");

function parseArgs(argv) {
  const parsed = {
    apply: false,
    maxSteps: 3,
    template: "react-vite",
    projectDir: path.resolve(repoRoot, ".demo/goal-agent-app")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--apply") {
      parsed.apply = true;
      continue;
    }

    if (current === "--max-steps") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-steps must be a positive integer.");
      }
      parsed.maxSteps = value;
      index += 1;
      continue;
    }

    if (current === "--template") {
      const value = (argv[index + 1] ?? "").trim();
      if (!value) {
        throw new Error("--template requires a value.");
      }
      parsed.template = value;
      index += 1;
      continue;
    }

    if (current === "--project-dir") {
      const value = (argv[index + 1] ?? "").trim();
      if (!value) {
        throw new Error("--project-dir requires a value.");
      }
      parsed.projectDir = path.resolve(value);
      index += 1;
    }
  }

  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      OG_ENABLE_MOCK_MODE: "1",
      ...(options.env ?? {})
    }
  });

  const header = `$ ${command} ${args.join(" ")}`;
  console.log(`\n${header}`);
  if (result.stdout?.trim()) {
    console.log(result.stdout.trim());
  }
  if (result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${header}`);
  }
}

function runCli(cliArgs, options = {}) {
  run(tsxBin, [cliEntry, ...cliArgs], {
    cwd: options.cwd ?? repoRoot,
    env: options.env
  });
}

async function readMemory(memoryPath) {
  try {
    const raw = await readFile(memoryPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.history)) {
      return { history: [] };
    }
    return parsed;
  } catch {
    return { history: [] };
  }
}

async function projectAlreadyInitialized(projectDir) {
  try {
    await access(path.join(projectDir, ".og", "manifest.json"));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const memoryDir = path.resolve(repoRoot, "examples/goal-agent/state");
  const memoryPath = path.join(memoryDir, "memory.json");
  await mkdir(memoryDir, { recursive: true });
  await mkdir(args.projectDir, { recursive: true });

  const goals = [
    "Create a landing page with headline, subtext, and CTA button.",
    "Improve accessibility by increasing color contrast and focus states.",
    "Add a short feature list section below the hero area."
  ].slice(0, args.maxSteps);

  const memory = await readMemory(memoryPath);

  runCli([
    "login",
    "--token",
    "mock-token",
    "--endpoint",
    "mock://local",
    "--account",
    "goal_agent"
  ]);

  if (await projectAlreadyInitialized(args.projectDir)) {
    console.log(`\nProject already initialized, skipping init: ${args.projectDir}`);
  } else {
    runCli([
      "init",
      "--template",
      args.template,
      "--dir",
      args.projectDir,
      "--yes",
      "--model",
      "0g-medium"
    ]);
  }

  for (let index = 0; index < goals.length; index += 1) {
    const goal = goals[index];
    const useCreate = index === 0;

    const commandArgs = [
      useCreate ? "create" : "edit",
      "--prompt",
      goal,
      "--yes"
    ];

    if (!args.apply) {
      commandArgs.push("--dry-run");
    }

    runCli(commandArgs, { cwd: args.projectDir });

    memory.history.push({
      timestamp: new Date().toISOString(),
      goal,
      mode: useCreate ? "create" : "edit",
      apply: args.apply,
      projectDir: args.projectDir
    });
  }

  await writeFile(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");

  console.log("\nGoal-agent run complete.");
  console.log(`Memory file: ${memoryPath}`);
  console.log(`Project dir: ${args.projectDir}`);
  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nGoal-agent failed: ${message}`);
  process.exitCode = 1;
});
