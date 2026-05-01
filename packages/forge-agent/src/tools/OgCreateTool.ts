import { spawnSync } from "node:child_process";
import type { AgentTool, ToolResult } from "../ToolRegistry.js";

export type OgCreateToolOptions = {
  cliEntry: string;
  tsxBin: string;
  projectDir: string;
  apply?: boolean;
  model?: string;
  env?: Record<string, string>;
};

export function createOgCreateTool(options: OgCreateToolOptions): AgentTool {
  return {
    name: "og:create",
    description: "Generate project files from a prompt using 0G Compute inference (og create).",
    async execute(args) {
      const prompt = typeof args.goal === "string" ? args.goal : String(args.prompt ?? "");
      if (!prompt.trim()) {
        return { success: false, output: "", error: "prompt is required for og:create." };
      }

      const cliArgs = ["create", "--prompt", prompt, "--yes"];
      if (!options.apply) cliArgs.push("--dry-run");
      if (options.model) cliArgs.push("--model", options.model);

      const result = spawnSync(options.tsxBin, [options.cliEntry, ...cliArgs], {
        cwd: options.projectDir,
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          OG_ENABLE_MOCK_MODE: process.env.OG_ENABLE_MOCK_MODE ?? "1",
          ...(options.env ?? {})
        }
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return {
        success: result.status === 0,
        output,
        error: result.status !== 0 ? `exit code ${result.status ?? "unknown"}` : undefined
      };
    }
  };
}

export function createOgEditTool(options: OgCreateToolOptions): AgentTool {
  return {
    name: "og:edit",
    description: "Edit existing project files from a prompt using 0G Compute inference (og edit).",
    async execute(args) {
      const prompt = typeof args.goal === "string" ? args.goal : String(args.prompt ?? "");
      if (!prompt.trim()) {
        return { success: false, output: "", error: "prompt is required for og:edit." };
      }

      const cliArgs = ["edit", "--prompt", prompt, "--yes"];
      if (!options.apply) cliArgs.push("--dry-run");
      if (options.model) cliArgs.push("--model", options.model);

      const result = spawnSync(options.tsxBin, [options.cliEntry, ...cliArgs], {
        cwd: options.projectDir,
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          OG_ENABLE_MOCK_MODE: process.env.OG_ENABLE_MOCK_MODE ?? "1",
          ...(options.env ?? {})
        }
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return {
        success: result.status === 0,
        output,
        error: result.status !== 0 ? `exit code ${result.status ?? "unknown"}` : undefined
      };
    }
  };
}

export function createOgSyncTool(options: Omit<OgCreateToolOptions, "apply" | "model">): AgentTool {
  return {
    name: "og:sync",
    description: "Push project metadata to 0G Storage (og sync push).",
    async execute(_args) {
      const result = spawnSync(options.tsxBin, [options.cliEntry, "sync", "push"], {
        cwd: options.projectDir,
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          ...(options.env ?? {})
        }
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      return {
        success: result.status === 0,
        output,
        error: result.status !== 0 ? `exit code ${result.status ?? "unknown"}` : undefined
      };
    }
  };
}
