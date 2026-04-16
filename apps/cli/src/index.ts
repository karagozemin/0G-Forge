#!/usr/bin/env node
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { createManifest, isOgProject, readManifest, updateManifest } from "@og/core";
import {
  ComputeClient,
  DEFAULT_COMPUTE_ENDPOINT,
  clearAuth,
  readAuth,
  saveAuth
} from "@og/compute-client";
import {
  DEFAULT_TEMPLATE_ID,
  SUPPORTED_TEMPLATE_IDS,
  copyTemplateToDirectory,
  resolveTemplate,
  type SupportedTemplateId
} from "./template-utils.js";

const program = new Command();

type AsyncAction<TArgs extends unknown[]> = (...args: TArgs) => Promise<void>;

function withErrorHandling<TArgs extends unknown[]>(
  action: AsyncAction<TArgs>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await action(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  };
}

async function promptValue(label: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const value = await rl.question(label);
    return value.trim();
  } finally {
    rl.close();
  }
}

async function requireStoredAuth() {
  const auth = await readAuth();
  if (!auth) {
    throw new Error("Not logged in. Run `og login` first.");
  }
  return auth;
}

async function resolveInitDefaultModel(explicitModel?: string): Promise<string> {
  if (explicitModel?.trim()) {
    return explicitModel.trim();
  }

  if (await isOgProject(process.cwd())) {
    try {
      const currentManifest = await readManifest(process.cwd());
      if (currentManifest.defaultModel.trim()) {
        return currentManifest.defaultModel;
      }
    } catch {
      return "0g-medium";
    }
  }

  return "0g-medium";
}

program
  .name("og")
  .description("Terminal-native companion for 0G App")
  .version("0.1.0");

program
  .command("doctor")
  .description("Validate basic monorepo wiring")
  .action(() => {
    console.log("CLI bootstrapped.");
  });

program
  .command("init")
  .description("Initialize a new local og project from template")
  .option("--template <id>", `Template id (${SUPPORTED_TEMPLATE_IDS.join(", ")})`)
  .option("--dir <path>", "Target directory", ".")
  .option("--model <id>", "Default model for project manifest")
  .option("--yes", "Allow writing into a non-empty target directory", false)
  .action(
    withErrorHandling(
      async (options: { template?: string; dir?: string; model?: string; yes?: boolean }) => {
        const targetDir = path.resolve(options.dir?.trim() || ".");
        await mkdir(targetDir, { recursive: true });

        if (await isOgProject(targetDir)) {
          throw new Error("Target directory is already an initialized og project.");
        }

        const entries = await readdir(targetDir);
        if (entries.length > 0 && !options.yes) {
          throw new Error(
            "Target directory is not empty. Re-run with --yes to allow writing into it."
          );
        }

        const selectedTemplateId = (options.template?.trim() ||
          DEFAULT_TEMPLATE_ID) as SupportedTemplateId;

        if (!options.template) {
          console.log(`No template specified. Using default template: ${DEFAULT_TEMPLATE_ID}`);
        }

        await resolveTemplate(selectedTemplateId);
        const copiedTemplate = await copyTemplateToDirectory(selectedTemplateId, targetDir);

        const projectName = path.basename(targetDir);
        if (!projectName) {
          throw new Error("Could not derive project name from target directory.");
        }

        const defaultModel = await resolveInitDefaultModel(options.model);

        await createManifest(
          {
            projectName,
            template: copiedTemplate.id,
            defaultModel,
            deployTarget: "vercel",
            syncEnabled: false
          },
          targetDir
        );

        console.log("Initialized og project successfully.");
        console.log(`Path: ${targetDir}`);
        console.log(`Template: ${copiedTemplate.id}`);
        console.log(`Default model: ${defaultModel}`);
        console.log(`Next: cd ${targetDir} && pnpm install`);
      }
    )
  );

program
  .command("login")
  .description("Store local 0G Compute credentials")
  .option("--token <token>", "Compute API token")
  .option("--endpoint <url>", "Compute API endpoint", DEFAULT_COMPUTE_ENDPOINT)
  .option("--account <accountId>", "Optional account id override")
  .action(
    withErrorHandling(async (options: { token?: string; endpoint?: string; account?: string }) => {
      const token =
        options.token?.trim() ||
        process.env.OG_COMPUTE_TOKEN?.trim() ||
        (await promptValue("Compute token: "));

      if (!token) {
        throw new Error("Token cannot be empty.");
      }

      const endpoint = options.endpoint?.trim() || DEFAULT_COMPUTE_ENDPOINT;

      const client = new ComputeClient({ endpoint });
      const identity = await client.validateAuthState({
        token,
        endpoint,
        accountId: options.account,
        savedAt: new Date().toISOString()
      });

      await saveAuth({
        token,
        endpoint: identity.endpoint,
        accountId: identity.accountId
      });

      console.log(`Logged in as ${identity.accountId} (${identity.validationMode} validation).`);
      console.log(`Endpoint: ${identity.endpoint}`);
    })
  );

program
  .command("logout")
  .description("Clear locally stored 0G Compute credentials")
  .action(
    withErrorHandling(async () => {
      await clearAuth();
      console.log("Logged out. Local auth removed.");
    })
  );

program
  .command("whoami")
  .description("Show current auth identity without leaking secrets")
  .action(
    withErrorHandling(async () => {
      const auth = await requireStoredAuth();
      const client = new ComputeClient({ endpoint: auth.endpoint });
      const identity = await client.validateAuthState(auth);

      console.log(`Account: ${identity.accountId}`);
      console.log(`Endpoint: ${identity.endpoint}`);
      console.log(`Token: ${identity.tokenPreview}`);
      console.log(`Validation: ${identity.validationMode}`);
      console.log(`Saved At: ${auth.savedAt}`);
    })
  );

const modelCommand = program.command("model").description("Manage compute model selection");

modelCommand
  .command("list")
  .description("List available 0G Compute models")
  .action(
    withErrorHandling(async () => {
      const auth = await requireStoredAuth();
      const client = new ComputeClient({ endpoint: auth.endpoint });
      const models = await client.listAvailableModels(auth);

      const idWidth = Math.max(...models.map((model) => model.id.length), 2);
      const nameWidth = Math.max(...models.map((model) => model.name.length), 4);

      const header = `${"ID".padEnd(idWidth)}  ${"NAME".padEnd(nameWidth)}  CONTEXT`;
      console.log(header);
      console.log("-".repeat(header.length));

      for (const model of models) {
        const context = model.contextWindow ? String(model.contextWindow) : "-";
        console.log(`${model.id.padEnd(idWidth)}  ${model.name.padEnd(nameWidth)}  ${context}`);
      }
    })
  );

modelCommand
  .command("use <modelId>")
  .description("Set default model in local .og/manifest.json")
  .action(
    withErrorHandling(async (modelId: string) => {
      const auth = await requireStoredAuth();
      const client = new ComputeClient({ endpoint: auth.endpoint });
      const models = await client.listAvailableModels(auth);

      if (!models.some((model) => model.id === modelId)) {
        throw new Error(`Model '${modelId}' not found in available models.`);
      }

      if (!(await isOgProject(process.cwd()))) {
        throw new Error("Current directory is not an initialized og project (.og/manifest.json missing).");
      }

      const manifest = await updateManifest({ defaultModel: modelId }, process.cwd());
      const refreshedManifest = await readManifest(process.cwd());

      console.log(`Default model set to '${manifest.defaultModel}' for project '${refreshedManifest.projectName}'.`);
    })
  );

void program.parseAsync(process.argv);
