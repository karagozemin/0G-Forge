import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { OgManifest } from "@og/core";
import {
  ensureCommandAvailable,
  ensureFileExists,
  formatCommand
} from "./runtime-utils.js";

export const SUPPORTED_DEPLOY_TEMPLATES = [
  "react-vite",
  "nextjs-app",
  "static-landing"
] as const;

export type SupportedDeployTemplate = (typeof SUPPORTED_DEPLOY_TEMPLATES)[number];

export type DeployConfig = {
  projectDir: string;
  template: SupportedDeployTemplate;
  deployTarget: "vercel";
  command: string;
  args: string[];
};

type ResolveDeployOptions = {
  prod?: boolean;
  yes?: boolean;
};

function isSupportedTemplate(value: string): value is SupportedDeployTemplate {
  return SUPPORTED_DEPLOY_TEMPLATES.includes(value as SupportedDeployTemplate);
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureVercelAuth(command: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, ["whoami"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let output = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Vercel authentication check failed. Run 'vercel login' first. Details: ${output.trim() || `exit code ${code}`}`
        )
      );
    });
  });
}

async function validateTemplateDeployPrerequisites(
  projectDir: string,
  template: SupportedDeployTemplate
): Promise<void> {
  if (template === "static-landing") {
    await ensureFileExists(path.join(projectDir, "index.html"), "index.html");
    return;
  }

  const packageJsonPath = path.join(projectDir, "package.json");
  await ensureFileExists(packageJsonPath, "package.json");

  const raw = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };

  if (!parsed.scripts || typeof parsed.scripts.build !== "string" || !parsed.scripts.build.trim()) {
    throw new Error("Missing 'build' script in package.json. Install dependencies/template files and retry.");
  }

  if (!(await pathExists(path.join(projectDir, "node_modules")))) {
    throw new Error("Missing node_modules. Run `pnpm install` before deploying this template.");
  }
}

export async function resolveDeployConfig(
  projectDir: string,
  manifest: OgManifest,
  options: ResolveDeployOptions = {}
): Promise<DeployConfig> {
  if (manifest.deployTarget !== "vercel") {
    throw new Error(`Unsupported deploy target '${manifest.deployTarget}'. v1 supports only 'vercel'.`);
  }

  if (!isSupportedTemplate(manifest.template)) {
    throw new Error(
      `Unsupported template '${manifest.template}' for deploy. Supported templates: ${SUPPORTED_DEPLOY_TEMPLATES.join(", ")}.`
    );
  }

  const template = manifest.template;

  await ensureCommandAvailable("vercel", "Install Vercel CLI via `pnpm add -g vercel` or `npm i -g vercel`." );
  await ensureVercelAuth("vercel");
  await validateTemplateDeployPrerequisites(projectDir, template);

  const args = ["deploy"];
  if (options.prod) {
    args.push("--prod");
  }
  if (options.yes) {
    args.push("--yes");
  }

  return {
    projectDir,
    template,
    deployTarget: "vercel",
    command: "vercel",
    args
  };
}

function parseDeploymentUrl(output: string): string | undefined {
  const urlMatches = output.match(/https?:\/\/[\w.-]+(?:\.vercel\.app|\.vercel\.com)\S*/g);
  if (!urlMatches || urlMatches.length === 0) {
    return undefined;
  }

  const preferred = urlMatches.find((url) => url.includes(".vercel.app"));
  return preferred ?? urlMatches[0];
}

export async function runVercelDeploy(config: DeployConfig): Promise<{
  deploymentUrl?: string;
  rawOutput: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, config.args, {
      cwd: config.projectDir,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env
    });

    let rawOutput = "";

    const forward = (chunk: Buffer | string, stream: NodeJS.WriteStream) => {
      const text = String(chunk);
      rawOutput += text;
      stream.write(text);
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      forward(chunk, process.stdout);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      forward(chunk, process.stderr);
    });

    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("Vercel CLI not found. Install it with `pnpm add -g vercel` or `npm i -g vercel`."));
        return;
      }

      reject(error);
    });

    child.once("exit", (code, signal) => {
      if (signal) {
        resolve({ rawOutput, deploymentUrl: parseDeploymentUrl(rawOutput) });
        return;
      }

      if (code === 0) {
        resolve({ rawOutput, deploymentUrl: parseDeploymentUrl(rawOutput) });
        return;
      }

      if (/not logged in|please login|run\s+vercel\s+login/i.test(rawOutput)) {
        reject(new Error("Vercel CLI is not authenticated. Run `vercel login` and retry."));
        return;
      }

      reject(
        new Error(
          `Vercel deploy failed with exit code ${code}. Command: ${formatCommand(config.command, config.args)}`
        )
      );
    });
  });
}

export function formatDeployCommand(config: DeployConfig): string {
  return formatCommand(config.command, config.args);
}
