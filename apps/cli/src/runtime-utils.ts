import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export const OG_PROJECT_NOT_FOUND_MESSAGE =
  "No initialized og project found from current directory upward. Run `og init` first.";

export const OG_PROJECT_MANIFEST_MISSING_MESSAGE =
  "Current project is missing .og/manifest.json. Run `og init` first.";

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