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
  type ComputeModel,
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
  inferNextStepFromError,
  OG_PROJECT_MANIFEST_MISSING_MESSAGE,
  OG_PROJECT_NOT_FOUND_MESSAGE,
  printField,
  printNextStep,
  printSection,
  printSuccess,
  printWarning,
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
      console.error(`✖ ${message}`);
      const nextStep = inferNextStepFromError(message);
      if (nextStep) {
        printNextStep(nextStep);
      }
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

function isLikelyProxyFallbackCatalog(models: ComputeModel[]): boolean {
  if (models.length === 0) {
    return false;
  }

  if (models.every((model) => model.name.includes("(proxy fallback)"))) {
    return true;
  }

  const defaultMockIds = new Set(["0g-large", "0g-medium", "0g-fast"]);
  return models.every((model) => defaultMockIds.has(model.id));
}

async function resolveSelectedModel(options: ResolveModelOptions): Promise<{
  auth: Awaited<ReturnType<typeof requireStoredAuth>>;
  model: string;
}> {
  const projectDir = options.projectDir ?? process.cwd();
  const auth = await requireStoredAuth();
  const client = new ComputeClient({ endpoint: auth.endpoint });
  const identity = await client.validateAuthState(auth);

  let models: ComputeModel[] = [];
  try {
    models = await client.listAvailableModels(auth);
  } catch (error) {
    if (identity.validationMode === "local") {
      throw error;
    }
  }

  const manifestModel = (await isOgProject(projectDir))
    ? (await readManifest(projectDir)).defaultModel
    : undefined;

  const selectedModel = options.explicitModel?.trim() || manifestModel?.trim() || "0g-medium";
  const selectedFromExplicit = Boolean(options.explicitModel?.trim());
  const selectedFromManifest = Boolean(!selectedFromExplicit && manifestModel?.trim());

  if (identity.validationMode === "local") {
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

  const hasProviderCatalog = models.length > 0 && !isLikelyProxyFallbackCatalog(models);
  if (hasProviderCatalog && !models.some((model) => model.id === selectedModel)) {
    if (!selectedFromExplicit && !selectedFromManifest) {
      throw new Error(
        `Model '${selectedModel}' is not listed by the configured provider endpoint. Use '--model <provider-model-id>' or set a provider-supported default model in your project.`
      );
    }

    throw new Error(
      `Model '${selectedModel}' is not listed by the configured provider endpoint. If your proxy does not expose model listing, keep using explicit provider model ids (for example '--model deepseek/deepseek-chat-v3-0324').`
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
  printSection(`Plan (${input.mode})`);
  printField("Model", input.model);
  printField("Template", input.template);
  printField("Summary", input.summary);
  printField(
    "Files",
    `${totalFiles} (create: ${input.createCount}, update: ${input.updateCount}, delete: ${input.deleteCount})`
  );
  printField("Execution", input.dryRun ? "dry-run" : "apply");
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
    printSuccess("CLI bootstrapped.");
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
          printWarning(`No template specified. Using default: ${DEFAULT_TEMPLATE_ID}`);
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

        printSection("Init Complete");
        printSuccess("Project initialized.");
        printField("Path", targetDir);
        printField("Template", copiedTemplate.id);
        printField("Selected model", defaultModel);
        printNextStep(`cd ${targetDir} && pnpm install`);
        printNextStep("Run `og create --prompt \"...\" --dry-run` to preview changes.");
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
          printSection("Diff Preview");
          console.log(pipelineResult.diffText);
        } else {
          printSection("Diff Preview");
          printField("Result", "No file content changes detected.");
        }

        if (options.dryRun) {
          printSuccess("Dry-run complete. No files were written.");
          printNextStep("Re-run without `--dry-run` (or add `--yes`) to apply changes.");
          return;
        }

        let shouldApply = options.yes === true;
        if (!shouldApply) {
          const confirmation = await promptValue("Apply these changes? (y/N): ");
          shouldApply = isConfirmationAccepted(confirmation);
        }

        if (!shouldApply) {
          printWarning("Confirmation rejected. No files were written.");
          return;
        }

        await applyPipelineResult(pipelineResult, { projectDir });
        printSuccess("Changes applied.");
        printNextStep("Run `og preview` to review the result locally.");
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
          printSection("Diff Preview");
          console.log(pipelineResult.diffText);
        } else {
          printSection("Diff Preview");
          printField("Result", "No file content changes detected.");
        }

        if (options.dryRun) {
          printSuccess("Dry-run complete. No files were written.");
          printNextStep("Re-run without `--dry-run` (or add `--yes`) to apply changes.");
          return;
        }

        let shouldApply = options.yes === true;
        if (!shouldApply) {
          const confirmation = await promptValue("Apply these changes? (y/N): ");
          shouldApply = isConfirmationAccepted(confirmation);
        }

        if (!shouldApply) {
          printWarning("Confirmation rejected. No files were written.");
          return;
        }

        await applyPipelineResult(pipelineResult, { projectDir });
        printSuccess("Changes applied.");
        printNextStep("Run `og preview` to verify edits locally.");
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

      printSection("Preview");
      printField("Project", projectRoot);
      printField("Template", previewConfig.template);
      printField("Command", formatPreviewCommand(previewConfig));
      if (previewConfig.url) {
        printField("Preview URL", previewConfig.url);
      }

      if (options.open) {
        if (previewConfig.url) {
          printField("Open mode", `enabled (attempting to open ${previewConfig.url})`);
        } else {
          printField("Open mode", "enabled (preview URL unknown; skipping browser open)");
        }
      }

      printNextStep("Press Ctrl+C to stop the preview server.");

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

      printSection("Deploy");
      printField("Project", projectRoot);
      printField("Template", deployConfig.template);
      printField("Target", deployConfig.deployTarget);
      printField("Command", formatDeployCommand(deployConfig));

      if (!options.yes) {
        printField("Mode", "interactive (Vercel CLI may ask for confirmation)");
      }

      const result = await runVercelDeploy(deployConfig);

      if (result.deploymentUrl) {
        printSuccess("Deployment completed.");
        printField("Deployment URL", result.deploymentUrl);
        printNextStep("Run `og sync push` to capture deployment metadata.");
      } else {
        printWarning("Deployment completed, but URL could not be parsed automatically.");
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

      printSection("Sync Push");
      printSuccess("Sync completed.");
      printField("Project", result.projectPath);
      printField("Sync provider", result.providerInfo.name);
      printField("Sync target", result.providerInfo.storagePath);
      printField("History entries", String(result.historyCount));
      printField("Artifacts", String(result.artifactCount));
      printField("Manifest synced", "yes");
      printField("Synced at", result.payload.syncedAt);
      printNextStep("Run `og sync pull` on another machine to restore metadata state.");
    })
  );

syncCommand
  .command("pull")
  .description("Pull latest .og metadata state from sync provider")
  .action(
    withErrorHandling(async () => {
      const resolved = await resolveSyncProject(process.cwd());
      const result = await pullSyncPayload(resolved.projectDir);

      printSection("Sync Pull");
      printSuccess("Sync completed.");
      printField("Project", result.projectPath);
      printField("Sync provider", result.providerInfo.name);
      printField("Sync target", result.providerInfo.storagePath);
      printField("History entries", String(result.historyCount));
      printField("Artifacts", String(result.artifactCount));
      printField("Manifest changed", result.manifestChanged ? "yes" : "no");
      printField("Remote syncedAt", result.payloadSyncedAt);
      printNextStep("Run `og preview` to verify pulled project state.");
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

      printSection("Login");
      printSuccess("Credentials saved.");
      printField("Account", `${identity.accountId} (${identity.validationMode} validation)`);
      printField("Endpoint", identity.endpoint);
      printNextStep("Run `og whoami` to verify session details.");
    })
  );

program
  .command("logout")
  .description("Clear locally stored 0G Compute credentials")
  .action(
    withErrorHandling(async () => {
      await clearAuth();
      printSuccess("Logged out. Local auth removed.");
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

      printSection("Whoami");
      printField("Account", identity.accountId);
      printField("Endpoint", identity.endpoint);
      printField("Token", identity.tokenPreview);
      printField("Validation", identity.validationMode);
      printField("Saved at", auth.savedAt);
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

      printSection("Model List");

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
      const identity = await client.validateAuthState(auth);

      if (identity.validationMode === "local") {
        const models = await client.listAvailableModels(auth);
        if (!models.some((model) => model.id === modelId)) {
          throw new Error(`Model '${modelId}' not found in available models.`);
        }
      } else {
        try {
          const models = await client.listAvailableModels(auth);
          const hasProviderCatalog = models.length > 0 && !isLikelyProxyFallbackCatalog(models);

          if (hasProviderCatalog && !models.some((model) => model.id === modelId)) {
            throw new Error(
              `Model '${modelId}' is not listed by the configured provider endpoint.`
            );
          }
        } catch (error) {
          if (error instanceof Error) {
            if (!/not listed by the configured provider endpoint/i.test(error.message)) {
              throw error;
            }

            throw error;
          }

          throw error;
        }
      }

      if (!(await isOgProject(process.cwd()))) {
        throw new Error("Current directory is not an initialized og project (.og/manifest.json missing).");
      }

      const manifest = await updateManifest({ defaultModel: modelId }, process.cwd());
      const refreshedManifest = await readManifest(process.cwd());

      printSuccess("Default model updated.");
      printField("Project", refreshedManifest.projectName);
      printField("Selected model", manifest.defaultModel);
    })
  );

void program.parseAsync(process.argv);
