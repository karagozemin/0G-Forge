import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { OgManifest } from "@og/core";
import { ensureCommandAvailable, ensureFileExists, formatCommand } from "./runtime-utils.js";

export const SUPPORTED_PREVIEW_TEMPLATES = [
  "react-vite",
  "nextjs-app",
  "static-landing"
] as const;

export type SupportedPreviewTemplate = (typeof SUPPORTED_PREVIEW_TEMPLATES)[number];

export type PreviewConfig = {
  projectDir: string;
  template: SupportedPreviewTemplate;
  command: string;
  args: string[];
  url?: string;
};

type ResolvePreviewOptions = {
  port?: number;
};

type RunPreviewOptions = {
  open?: boolean;
};

type PackageJsonLike = {
  scripts?: Record<string, string>;
};

function isSupportedTemplate(value: string): value is SupportedPreviewTemplate {
  return SUPPORTED_PREVIEW_TEMPLATES.includes(value as SupportedPreviewTemplate);
}

async function resolveProjectPackageScripts(projectDir: string): Promise<Record<string, string>> {
  const packageJsonPath = path.join(projectDir, "package.json");
  await ensureFileExists(packageJsonPath, "package.json");

  const raw = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as PackageJsonLike;

  if (!parsed.scripts || typeof parsed.scripts !== "object") {
    return {};
  }

  return parsed.scripts;
}

function resolveTemplateDefaultPort(template: SupportedPreviewTemplate): number {
  if (template === "nextjs-app") {
    return 3000;
  }

  if (template === "static-landing") {
    return 4173;
  }

  return 5173;
}

async function resolveStaticPreviewCommand(): Promise<string> {
  const candidates = ["python3", "python"];

  for (const candidate of candidates) {
    try {
      await ensureCommandAvailable(
        candidate,
        "Install Python 3 or use another supported preview setup."
      );
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "No Python runtime found for static preview. Install Python 3 to run `og preview` for static-landing."
  );
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;

  if (platform === "darwin") {
    const child = spawn("open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }

  if (platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }

  if (platform === "linux") {
    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }

  throw new Error(`Automatic browser open is not supported on platform: ${platform}`);
}

export async function resolvePreviewConfig(
  projectDir: string,
  manifest: OgManifest,
  options: ResolvePreviewOptions = {}
): Promise<PreviewConfig> {
  if (!isSupportedTemplate(manifest.template)) {
    throw new Error(
      `Unsupported template '${manifest.template}' for preview. Supported templates: ${SUPPORTED_PREVIEW_TEMPLATES.join(", ")}.`
    );
  }

  const template = manifest.template;
  const port = options.port ?? resolveTemplateDefaultPort(template);

  if (template === "react-vite") {
    await ensureCommandAvailable("pnpm", "Install pnpm and ensure it is on PATH.");
    await ensureFileExists(path.join(projectDir, "node_modules"), "node_modules");

    const scripts = await resolveProjectPackageScripts(projectDir);
    if (!scripts.dev) {
      throw new Error("Missing dev script in project package.json. Run `pnpm install` or check template files.");
    }

    return {
      projectDir,
      template,
      command: "pnpm",
      args: ["run", "dev", "--host", "127.0.0.1", "--port", String(port)],
      url: `http://127.0.0.1:${port}`
    };
  }

  if (template === "nextjs-app") {
    await ensureCommandAvailable("pnpm", "Install pnpm and ensure it is on PATH.");
    await ensureFileExists(path.join(projectDir, "node_modules"), "node_modules");

    const scripts = await resolveProjectPackageScripts(projectDir);
    if (!scripts.dev) {
      throw new Error("Missing dev script in project package.json. Run `pnpm install` or check template files.");
    }

    return {
      projectDir,
      template,
      command: "pnpm",
      args: ["run", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      url: `http://127.0.0.1:${port}`
    };
  }

  await ensureFileExists(path.join(projectDir, "index.html"), "index.html");
  const pythonCommand = await resolveStaticPreviewCommand();

  return {
    projectDir,
    template,
    command: pythonCommand,
    args: ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    url: `http://127.0.0.1:${port}`
  };
}

export async function runPreview(config: PreviewConfig, options: RunPreviewOptions = {}): Promise<void> {
  if (options.open && config.url) {
    try {
      await openBrowser(config.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not open browser automatically: ${message}`);
    }
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.command, config.args, {
      cwd: config.projectDir,
      stdio: "inherit",
      env: process.env
    });

    const forwardSignal = (signal: NodeJS.Signals) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);

    child.once("error", (error) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);

      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `Failed to run preview command '${formatCommand(config.command, config.args)}'. Command not found: ${config.command}.`
          )
        );
        return;
      }

      reject(error);
    });

    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);

      if (signal) {
        resolve();
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Preview process exited with code ${code}. Command: ${formatCommand(config.command, config.args)}`
        )
      );
    });
  });
}

export function formatPreviewCommand(config: PreviewConfig): string {
  return formatCommand(config.command, config.args);
}
