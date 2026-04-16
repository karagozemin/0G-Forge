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
import {
  ComputeGenerationProvider,
  applyPipelineResult,
  runCreateEditPipeline
} from "./create-edit-pipeline.js";
import {
  formatPreviewCommand,
  resolvePreviewConfig,
  runPreview
} from "./preview-runner.js";
import {
  formatDeployCommand,
  resolveDeployConfig,
  runVercelDeploy
} from "./deploy-runner.js";
import {
  pullSyncPayload,
  pushSyncPayload,
  resolveSyncProject
} from "./sync-runner.js";
import {
  OG_PROJECT_MANIFEST_MISSING_MESSAGE,
  OG_PROJECT_NOT_FOUND_MESSAGE,
  resolveOgProjectRoot
} from "./runtime-utils.js";

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

type ResolveModelOptions = {
  explicitModel?: string;
  projectDir?: string;
};

async function resolveSelectedModel(options: ResolveModelOptions): Promise<{
  auth: Awaited<ReturnType<typeof requireStoredAuth>>;
  model: string;
}> {
  const projectDir = options.projectDir ?? process.cwd();
  const auth = await requireStoredAuth();
  const client = new ComputeClient({ endpoint: auth.endpoint });
  const models = await client.listAvailableModels(auth);

  const manifestModel = (await isOgProject(projectDir))
    ? (await readManifest(projectDir)).defaultModel
    : undefined;

  const selectedModel = options.explicitModel?.trim() || manifestModel?.trim() || "0g-medium";

  if (!models.some((model) => model.id === selectedModel)) {
    throw new Error(
      `Model '${selectedModel}' not found in available models. Run 'og model list' to inspect options.`
    );
  }

  return {
    auth,
    model: selectedModel
  };
}

function printPipelineOverview(input: {
  mode: "create" | "edit";
  model: string;
  template: string;
  createCount: number;
  updateCount: number;
  deleteCount: number;
  dryRun: boolean;
  summary: string;
}): void {
  const totalFiles = input.createCount + input.updateCount + input.deleteCount;
  console.log(`Mode: ${input.mode}`);
  console.log(`Model: ${input.model}`);
  console.log(`Template: ${input.template}`);
  console.log(`Summary: ${input.summary}`);
  console.log(`Files: ${totalFiles} (create: ${input.createCount}, update: ${input.updateCount}, delete: ${input.deleteCount})`);
  console.log(`Execution: ${input.dryRun ? "dry-run" : "apply"}`);
}

function isConfirmationAccepted(value: string): boolean {
  return /^(y|yes)$/i.test(value.trim());
}

function parsePort(rawPort: string | undefined): number | undefined {
  if (!rawPort) {
    return undefined;
  }

  const parsed = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port '${rawPort}'. Port must be an integer between 1 and 65535.`);
  }

  return parsed;
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
  .command("create")
  .description("Generate project files from prompt with plan/diff/apply workflow")
  .requiredOption("--prompt <text>", "Prompt describing what to build")
  .option("--template <id>", `Template id (${SUPPORTED_TEMPLATE_IDS.join(", ")})`)
  .option("--model <id>", "Model id override")
  .option("--yes", "Skip confirmation and apply directly", false)
  .option("--dry-run", "Generate plan and diff without writing files", false)
  .action(
    withErrorHandling(
      async (options: {
        prompt?: string;
        template?: string;
        model?: string;
        yes?: boolean;
        dryRun?: boolean;
      }) => {
        const prompt = options.prompt?.trim();
        if (!prompt) {
          throw new Error("Prompt cannot be empty.");
        }

        const projectDir = process.cwd();

        const selectedTemplate = (options.template?.trim() || undefined) as
          | SupportedTemplateId
          | undefined;

        if (selectedTemplate) {
          if (!SUPPORTED_TEMPLATE_IDS.includes(selectedTemplate)) {
            throw new Error(
              `Unsupported template '${selectedTemplate}'. Supported templates: ${SUPPORTED_TEMPLATE_IDS.join(", ")}.`
            );
          }

          await resolveTemplate(selectedTemplate);
        }

        const { auth, model } = await resolveSelectedModel({
          explicitModel: options.model,
          projectDir
        });

        const provider = new ComputeGenerationProvider({
          endpoint: auth.endpoint,
          token: auth.token
        });

        const pipelineResult = await runCreateEditPipeline({
          mode: "create",
          prompt,
          projectDir,
          selectedModel: model,
          templateOverride: selectedTemplate,
          provider
        });

        printPipelineOverview({
          mode: "create",
          model: pipelineResult.model,
          template: pipelineResult.template,
          createCount: pipelineResult.createCount,
          updateCount: pipelineResult.updateCount,
          deleteCount: pipelineResult.deleteCount,
          dryRun: options.dryRun === true,
          summary: pipelineResult.summary
        });

        if (pipelineResult.diffText.trim().length > 0) {
          console.log("\nDiff preview:\n");
          console.log(pipelineResult.diffText);
        } else {
          console.log("\nDiff preview: no file content changes detected.");
        }

        if (options.dryRun) {
          console.log("Dry-run mode: no files written.");
          return;
        }

        let shouldApply = options.yes === true;
        if (!shouldApply) {
          const confirmation = await promptValue("Apply these changes? (y/N): ");
          shouldApply = isConfirmationAccepted(confirmation);
        }

        if (!shouldApply) {
          console.log("Confirmation: rejected. No files written.");
          return;
        }

        await applyPipelineResult(pipelineResult, { projectDir });
        console.log("Confirmation: accepted. Changes applied.");
      }
    )
  );

program
  .command("edit")
  .description("Edit existing project files from prompt with plan/diff/apply workflow")
  .requiredOption("--prompt <text>", "Prompt describing requested edits")
  .option("--model <id>", "Model id override")
  .option("--yes", "Skip confirmation and apply directly", false)
  .option("--dry-run", "Generate plan and diff without writing files", false)
  .action(
    withErrorHandling(
      async (options: { prompt?: string; model?: string; yes?: boolean; dryRun?: boolean }) => {
        const prompt = options.prompt?.trim();
        if (!prompt) {
          throw new Error("Prompt cannot be empty.");
        }

        const projectDir = process.cwd();

        if (!(await isOgProject(projectDir))) {
          throw new Error("`og edit` requires an initialized og project. Run `og init` first.");
        }

        const { auth, model } = await resolveSelectedModel({
          explicitModel: options.model,
          projectDir
        });

        const provider = new ComputeGenerationProvider({
          endpoint: auth.endpoint,
          token: auth.token
        });

        const pipelineResult = await runCreateEditPipeline({
          mode: "edit",
          prompt,
          projectDir,
          selectedModel: model,
          provider
        });

        printPipelineOverview({
          mode: "edit",
          model: pipelineResult.model,
          template: pipelineResult.template,
          createCount: pipelineResult.createCount,
          updateCount: pipelineResult.updateCount,
          deleteCount: pipelineResult.deleteCount,
          dryRun: options.dryRun === true,
          summary: pipelineResult.summary
        });

        if (pipelineResult.diffText.trim().length > 0) {
          console.log("\nDiff preview:\n");
          console.log(pipelineResult.diffText);
        } else {
          console.log("\nDiff preview: no file content changes detected.");
        }

        if (options.dryRun) {
          console.log("Dry-run mode: no files written.");
          return;
        }

        let shouldApply = options.yes === true;
        if (!shouldApply) {
          const confirmation = await promptValue("Apply these changes? (y/N): ");
          shouldApply = isConfirmationAccepted(confirmation);
        }

        if (!shouldApply) {
          console.log("Confirmation: rejected. No files written.");
          return;
        }

        await applyPipelineResult(pipelineResult, { projectDir });
        console.log("Confirmation: accepted. Changes applied.");
      }
    )
  );

program
  .command("preview")
  .description("Run local template-aware preview server for current og project")
  .option("--port <number>", "Override preview port")
  .option("--open", "Open preview URL in browser when possible", false)
  .action(
    withErrorHandling(async (options: { port?: string; open?: boolean }) => {
      const projectRoot = await resolveOgProjectRoot(process.cwd());

      if (!projectRoot) {
        throw new Error(OG_PROJECT_NOT_FOUND_MESSAGE);
      }

      if (!(await isOgProject(projectRoot))) {
        throw new Error(OG_PROJECT_MANIFEST_MISSING_MESSAGE);
      }

      const manifest = await readManifest(projectRoot);
      const port = parsePort(options.port);

      const previewConfig = await resolvePreviewConfig(projectRoot, manifest, { port });

      console.log(`Project path: ${projectRoot}`);
      console.log(`Detected template: ${previewConfig.template}`);
      console.log(`Command: ${formatPreviewCommand(previewConfig)}`);
      if (previewConfig.url) {
        console.log(`Preview URL: ${previewConfig.url}`);
      }

      if (options.open) {
        if (previewConfig.url) {
          console.log(`Open mode: enabled (attempting to open ${previewConfig.url})`);
        } else {
          console.log("Open mode: enabled (preview URL is unknown, skipping browser open)");
        }
      }

      await runPreview(previewConfig, { open: options.open });
    })
  );

const deployCommand = program.command("deploy").description("Deploy current og project");

deployCommand
  .command("vercel")
  .description("Deploy current og project to Vercel")
  .option("--prod", "Create a production deployment", false)
  .option("--yes", "Run non-interactive deploy where supported", false)
  .action(
    withErrorHandling(async (options: { prod?: boolean; yes?: boolean }) => {
      const projectRoot = await resolveOgProjectRoot(process.cwd());
      if (!projectRoot) {
        throw new Error(OG_PROJECT_NOT_FOUND_MESSAGE);
      }

      if (!(await isOgProject(projectRoot))) {
        throw new Error(OG_PROJECT_MANIFEST_MISSING_MESSAGE);
      }

      const manifest = await readManifest(projectRoot);
      const deployConfig = await resolveDeployConfig(projectRoot, manifest, {
        prod: options.prod,
        yes: options.yes
      });

      console.log(`Project path: ${projectRoot}`);
      console.log(`Detected template: ${deployConfig.template}`);
      console.log(`Deploy target: ${deployConfig.deployTarget}`);
      console.log(`Command: ${formatDeployCommand(deployConfig)}`);

      if (!options.yes) {
        console.log("Deploy mode: interactive (Vercel CLI may ask for confirmation)");
      }

      const result = await runVercelDeploy(deployConfig);

      if (result.deploymentUrl) {
        console.log(`Deployment URL: ${result.deploymentUrl}`);
      } else {
        console.log("Deployment completed, but URL could not be parsed automatically.");
        if (result.rawOutput.trim()) {
          console.log(result.rawOutput.trim());
        }
      }
    })
  );

const syncCommand = program.command("sync").description("Sync local og metadata state");

syncCommand
  .command("push")
  .description("Push local .og metadata and lightweight artifacts to sync provider")
  .action(
    withErrorHandling(async () => {
      const resolved = await resolveSyncProject(process.cwd());
      const result = await pushSyncPayload(resolved.projectDir);

      console.log(`Project path: ${result.projectPath}`);
      console.log(`Sync provider: ${result.providerInfo.name}`);
      console.log(`Sync target: ${result.providerInfo.storagePath}`);
      console.log(`History entries synced: ${result.historyCount}`);
      console.log(`Artifacts included: ${result.artifactCount}`);
      console.log(`Manifest synced: yes`);
      console.log(`Synced at: ${result.payload.syncedAt}`);
    })
  );

syncCommand
  .command("pull")
  .description("Pull latest .og metadata state from sync provider")
  .action(
    withErrorHandling(async () => {
      const resolved = await resolveSyncProject(process.cwd());
      const result = await pullSyncPayload(resolved.projectDir);

      console.log(`Project path: ${result.projectPath}`);
      console.log(`Sync provider: ${result.providerInfo.name}`);
      console.log(`Sync target: ${result.providerInfo.storagePath}`);
      console.log(`History entries synced: ${result.historyCount}`);
      console.log(`Artifacts included: ${result.artifactCount}`);
      console.log(`Manifest changed: ${result.manifestChanged ? "yes" : "no"}`);
      console.log(`Remote payload syncedAt: ${result.payloadSyncedAt}`);
    })
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
