import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export const OG_PROJECT_NOT_FOUND_MESSAGE =
  "No initialized og project found from current directory upward. Run `og init` first.";

export const OG_PROJECT_MANIFEST_MISSING_MESSAGE =
  "Current project is missing .og/manifest.json. Run `og init` first.";

const SECTION_DIVIDER = "────────────────────────────────────────";

export function printSection(title: string): void {
  console.log(`\n${SECTION_DIVIDER}`);
  console.log(`${title}`);
  console.log(`${SECTION_DIVIDER}`);
}

export function printField(label: string, value: string): void {
  console.log(`• ${label}: ${value}`);
}

export function printSuccess(message: string): void {
  console.log(`✓ ${message}`);
}

export function printWarning(message: string): void {
  console.log(`! ${message}`);
}

export function printNextStep(message: string): void {
  console.log(`→ Next: ${message}`);
}

export function inferNextStepFromError(message: string): string | undefined {
  if (/not logged in/i.test(message)) {
    return "Run `og login --token <token> --endpoint <url>` before this command.";
  }

  if (/missing node_modules/i.test(message)) {
    return "Run `pnpm install` in the project directory, then retry.";
  }

  if (/invalid endpoint|unsupported compute endpoint|openai-compatible proxy path/i.test(message)) {
    return "Use a valid http(s) endpoint (for example `.../v1/proxy`) and retry `og login`.";
  }

  if (/timed out after/i.test(message)) {
    return "Retry in a moment, or use a shorter prompt to reduce provider latency.";
  }

  if (/rate limit|too many requests|retry after/i.test(message)) {
    return "Wait for provider cooldown, then retry with the same command.";
  }

  if (/forbidden|unauthorized|token/i.test(message)) {
    return "Re-run `og login` with a valid token and endpoint.";
  }

  return undefined;
}

export async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureFileExists(absolutePath: string, label: string): Promise<void> {
  if (!(await pathExists(absolutePath))) {
    throw new Error(`Missing ${label}: ${absolutePath}`);
  }
}

export async function ensureCommandAvailable(command: string, installHint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, ["--version"], { stdio: "ignore" });

    child.once("error", () => {
      reject(new Error(`${command} is not available. ${installHint}`));
    });

    child.once("exit", () => {
      resolve();
    });
  });
}

function quoteShellArg(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map((part) => quoteShellArg(part)).join(" ");
}

export async function resolveOgProjectRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);

  while (true) {
    const manifestPath = path.join(current, ".og", "manifest.json");
    if (await pathExists(manifestPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}