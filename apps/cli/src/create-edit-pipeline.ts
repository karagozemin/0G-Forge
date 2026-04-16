import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createManifest, isOgProject, readManifest } from "@og/core";
import { MOCK_COMPUTE_ENDPOINT } from "@og/compute-client";
import { DEFAULT_TEMPLATE_ID } from "./template-utils.js";
import { createUnifiedDiff } from "./diff-utils.js";

const SKIPPED_DIRS = new Set([
  ".git",
  ".og",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".pnpm-store"
]);

const MAX_FILE_BYTES = 120_000;
const MAX_CONTEXT_FILES = 80;
const DEFAULT_FALLBACK_MODEL = "0g-medium";
const DEFAULT_GENERATION_TIMEOUT_MS = 45_000;
const GENERATION_ENDPOINT_PATHS = ["/v1/generate-plan", "/v1/generation/plan"] as const;

export type PipelineMode = "create" | "edit";
export type PlannedFileAction = "create" | "update" | "delete";

export type PlannedFile = {
  path: string;
  action: PlannedFileAction;
  content?: string;
};

export type StructuredPatchPlan = {
  summary: string;
  template: string;
  files: PlannedFile[];
};

export type ExistingProjectFile = {
  path: string;
  content: string;
};

export type GenerationRequest = {
  mode: PipelineMode;
  prompt: string;
  template: string;
  model: string;
  projectName: string;
  existingFiles: ExistingProjectFile[];
};

export type GenerationProvider = {
  generatePlan(request: GenerationRequest): Promise<unknown>;
};

export type PipelineRunOptions = {
  mode: PipelineMode;
  prompt: string;
  projectDir: string;
  selectedModel?: string;
  templateOverride?: string;
  provider: GenerationProvider;
};

export type PipelineChange = {
  path: string;
  action: PlannedFileAction;
  previousContent: string;
  nextContent: string;
  absolutePath: string;
};

export type PipelineResult = {
  summary: string;
  template: string;
  model: string;
  projectName: string;
  changes: PipelineChange[];
  diffText: string;
  createCount: number;
  updateCount: number;
  deleteCount: number;
  requiresInitialization: boolean;
  initializedBeforeRun: boolean;
};

export type ApplyPipelineOptions = {
  projectDir: string;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelativePath(rawPath: string): string {
  const normalizedSlashes = rawPath.replace(/\\/g, "/").trim();

  if (!normalizedSlashes) {
    throw new Error("Generated file path cannot be empty.");
  }

  if (normalizedSlashes.includes("\0")) {
    throw new Error("Generated file path cannot contain NUL bytes.");
  }

  if (normalizedSlashes.startsWith("/")) {
    throw new Error(`Generated file path must be relative: '${rawPath}'.`);
  }

  if (/^[A-Za-z]:/.test(normalizedSlashes)) {
    throw new Error(`Generated file path must not include a drive prefix: '${rawPath}'.`);
  }

  const normalized = path.posix.normalize(normalizedSlashes);

  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error(`Generated file path is invalid: '${rawPath}'.`);
  }

  if (normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Generated file path escapes project directory: '${rawPath}'.`);
  }

  const firstSegment = normalized.split("/")[0]?.toLowerCase();
  if (firstSegment === ".og") {
    throw new Error("Generated file path cannot target .og internal state.");
  }

  return normalized;
}

function resolveProjectPath(projectDir: string, relativePath: string): string {
  const absoluteProjectDir = path.resolve(projectDir);
  const absolutePath = path.resolve(absoluteProjectDir, relativePath);

  if (
    absolutePath !== absoluteProjectDir &&
    !absolutePath.startsWith(`${absoluteProjectDir}${path.sep}`)
  ) {
    throw new Error(`Path escapes project directory: '${relativePath}'.`);
  }

  return absolutePath;
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(absolutePath: string): Promise<string> {
  if (!(await pathExists(absolutePath))) {
    return "";
  }

  return readFile(absolutePath, "utf8");
}

function validateStructuredPatchPlan(input: unknown): StructuredPatchPlan {
  if (!isObjectRecord(input)) {
    throw new Error("Generation response is invalid: expected object.");
  }

  if (typeof input.summary !== "string" || input.summary.trim().length === 0) {
    throw new Error("Generation response is invalid: summary is required.");
  }

  if (typeof input.template !== "string" || input.template.trim().length === 0) {
    throw new Error("Generation response is invalid: template is required.");
  }

  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new Error("Generation response is invalid: files[] is required.");
  }

  const files: PlannedFile[] = input.files.map((item, index) => {
    if (!isObjectRecord(item)) {
      throw new Error(`Generation response is invalid: files[${index}] must be object.`);
    }

    if (typeof item.path !== "string") {
      throw new Error(`Generation response is invalid: files[${index}].path must be string.`);
    }

    if (item.action !== "create" && item.action !== "update" && item.action !== "delete") {
      throw new Error(
        `Generation response is invalid: files[${index}].action must be create|update|delete.`
      );
    }

    const normalizedPath = normalizeRelativePath(item.path);

    if (item.action === "delete") {
      return {
        path: normalizedPath,
        action: item.action
      };
    }

    if (typeof item.content !== "string") {
      throw new Error(
        `Generation response is invalid: files[${index}].content must be string for create/update.`
      );
    }

    return {
      path: normalizedPath,
      action: item.action,
      content: item.content
    };
  });

  return {
    summary: input.summary.trim(),
    template: input.template.trim(),
    files
  };
}

async function collectProjectFiles(projectDir: string): Promise<ExistingProjectFile[]> {
  const files: ExistingProjectFile[] = [];

  async function walk(dirPath: string): Promise<void> {
    if (files.length >= MAX_CONTEXT_FILES) {
      return;
    }

    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= MAX_CONTEXT_FILES) {
        return;
      }

      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) {
          continue;
        }

        await walk(path.join(dirPath, entry.name));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(dirPath, entry.name);
      const relativePath = path.relative(projectDir, absolutePath).replace(/\\/g, "/");

      if (!relativePath || relativePath.startsWith("..")) {
        continue;
      }

      let raw: string;
      try {
        const content = await readFile(absolutePath, "utf8");
        if (content.length > MAX_FILE_BYTES) {
          continue;
        }
        raw = content;
      } catch {
        continue;
      }

      files.push({ path: relativePath, content: raw });
    }
  }

  await walk(projectDir);
  return files;
}

function choosePrimaryTemplateFile(template: string): string {
  if (template === "nextjs-app") {
    return "app/page.tsx";
  }

  if (template === "static-landing") {
    return "index.html";
  }

  return "src/App.tsx";
}

function createMockFileContent(
  mode: PipelineMode,
  prompt: string,
  template: string,
  targetPath: string
): string {
  if (targetPath.endsWith(".tsx")) {
    return `import React from "react";\n\nexport default function App() {\n  return (\n    <main style={{ padding: 24 }}>\n      <h1>${mode === "create" ? "New app" : "Updated app"}</h1>\n      <p>Prompt: ${prompt}</p>\n      <p>Template: ${template}</p>\n    </main>\n  );\n}\n`;
  }

  if (targetPath.endsWith(".html")) {
    return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>0G App</title>\n  </head>\n  <body>\n    <main>\n      <h1>${mode === "create" ? "Generated page" : "Edited page"}</h1>\n      <p>Prompt: ${prompt}</p>\n      <p>Template: ${template}</p>\n    </main>\n  </body>\n</html>\n`;
  }

  return `# ${mode === "create" ? "Generated" : "Edited"} file\n\nPrompt: ${prompt}\nTemplate: ${template}\n`;
}

function createMockPlan(request: GenerationRequest): StructuredPatchPlan {
  const existingPathSet = new Set(request.existingFiles.map((file) => file.path));
  const preferredPath = choosePrimaryTemplateFile(request.template);

  const targetPath =
    request.mode === "edit"
      ? existingPathSet.has(preferredPath)
        ? preferredPath
        : request.existingFiles[0]?.path ?? preferredPath
      : preferredPath;

  const action: PlannedFileAction = existingPathSet.has(targetPath) ? "update" : "create";

  return {
    summary:
      request.mode === "create"
        ? "Create baseline app file from prompt"
        : "Edit existing project file based on prompt",
    template: request.template,
    files: [
      {
        path: targetPath,
        action,
        content: createMockFileContent(request.mode, request.prompt, request.template, targetPath)
      }
    ]
  };
}

function isHttpEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("http://") || endpoint.startsWith("https://");
}

function isMockEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("mock://");
}

function parseProviderErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    const nestedRecord = nestedError as Record<string, unknown>;
    if (typeof nestedRecord.message === "string" && nestedRecord.message.trim()) {
      return nestedRecord.message.trim();
    }
  }

  return undefined;
}

export class ComputeGenerationProvider implements GenerationProvider {
  constructor(
    private readonly options: {
      endpoint: string;
      token: string;
      fetchImpl?: typeof fetch;
      requestTimeoutMs?: number;
    }
  ) {}

  async generatePlan(request: GenerationRequest): Promise<unknown> {
    const endpoint = this.options.endpoint.trim().replace(/\/+$/, "");

    if (isMockEndpoint(endpoint)) {
      return createMockPlan(request);
    }

    if (!isHttpEndpoint(endpoint)) {
      throw new Error(
        `Unsupported compute endpoint '${endpoint}'. Use an http(s) endpoint for real generation or '${MOCK_COMPUTE_ENDPOINT}' for mock mode.`
      );
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const requestTimeoutMs = this.options.requestTimeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS;
    const payload = {
      mode: request.mode,
      prompt: request.prompt,
      model: request.model,
      template: request.template,
      projectName: request.projectName,
      files: request.existingFiles
    };

    let lastError: Error | undefined;
    for (const routePath of GENERATION_ENDPOINT_PATHS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

      try {
        const response = await fetchImpl(`${endpoint}${routePath}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.token}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        const rawBody = await response.text();
        const parsedBody = rawBody.trim() ? (JSON.parse(rawBody) as unknown) : undefined;

        if (!response.ok) {
          if (response.status === 404) {
            lastError = new Error(`Generation route not found at ${routePath}.`);
            continue;
          }

          const providerMessage = parseProviderErrorMessage(parsedBody);
          if (response.status === 401) {
            throw new Error(
              providerMessage || "Generation request unauthorized. Re-run `og login` with valid credentials."
            );
          }

          if (response.status === 403) {
            throw new Error(
              providerMessage || `Generation forbidden for model '${request.model}'. Verify account/model permissions.`
            );
          }

          throw new Error(providerMessage || `Generation request failed with status ${response.status}.`);
        }

        if (!rawBody.trim()) {
          throw new Error("Generation provider returned an empty response body.");
        }

        return parsedBody;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Generation request timed out after ${requestTimeoutMs}ms.`);
        }

        if (error instanceof Error) {
          lastError = error;
        } else {
          lastError = new Error(String(error));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new Error(
      `Generation request failed across provider routes: ${GENERATION_ENDPOINT_PATHS.join(", ")}. ${lastError ? `Last error: ${lastError.message}` : ""}`.trim()
    );
  }
}

function determineModel(explicitModel: string | undefined, manifestModel: string | undefined): string {
  if (explicitModel?.trim()) {
    return explicitModel.trim();
  }

  if (manifestModel?.trim()) {
    return manifestModel.trim();
  }

  return DEFAULT_FALLBACK_MODEL;
}

export async function runCreateEditPipeline(options: PipelineRunOptions): Promise<PipelineResult> {
  const projectDir = path.resolve(options.projectDir);
  const initialized = await isOgProject(projectDir);

  if (options.mode === "edit" && !initialized) {
    throw new Error("`og edit` requires an initialized og project (.og/manifest.json missing).");
  }

  const manifest = initialized ? await readManifest(projectDir) : null;

  const template =
    options.mode === "create"
      ? options.templateOverride?.trim() || manifest?.template || DEFAULT_TEMPLATE_ID
      : manifest?.template || DEFAULT_TEMPLATE_ID;

  const model = determineModel(options.selectedModel, manifest?.defaultModel);

  const projectName = manifest?.projectName || path.basename(projectDir);
  if (!projectName) {
    throw new Error("Could not determine project name from current directory.");
  }

  const existingFiles = await collectProjectFiles(projectDir);

  let providerResult: unknown;
  try {
    providerResult = await options.provider.generatePlan({
      mode: options.mode,
      prompt: options.prompt,
      template,
      model,
      projectName,
      existingFiles
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generation provider request failed: ${message}`);
  }

  let structuredPlan: StructuredPatchPlan;
  try {
    structuredPlan = validateStructuredPatchPlan(providerResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generation provider returned invalid structured response: ${message}`);
  }

  const changes: PipelineChange[] = [];
  for (const planned of structuredPlan.files) {
    const absolutePath = resolveProjectPath(projectDir, planned.path);
    const previousContent = await readFileIfExists(absolutePath);
    const nextContent = planned.action === "delete" ? "" : planned.content ?? "";

    changes.push({
      path: planned.path,
      action: planned.action,
      previousContent,
      nextContent,
      absolutePath
    });
  }

  const diffSections = changes
    .map((change) => createUnifiedDiff(change.path, change.previousContent, change.nextContent))
    .filter((section) => section.length > 0);

  const createCount = changes.filter((change) => change.action === "create").length;
  const updateCount = changes.filter((change) => change.action === "update").length;
  const deleteCount = changes.filter((change) => change.action === "delete").length;

  return {
    summary: structuredPlan.summary,
    template: structuredPlan.template,
    model,
    projectName,
    changes,
    diffText: diffSections.join("\n"),
    createCount,
    updateCount,
    deleteCount,
    requiresInitialization: options.mode === "create" && !initialized,
    initializedBeforeRun: initialized
  };
}

export async function applyPipelineResult(
  result: PipelineResult,
  options: ApplyPipelineOptions
): Promise<void> {
  const projectDir = path.resolve(options.projectDir);

  if (result.requiresInitialization) {
    await createManifest(
      {
        projectName: result.projectName,
        template: result.template,
        defaultModel: result.model,
        deployTarget: "vercel",
        syncEnabled: false
      },
      projectDir
    );
  }

  for (const change of result.changes) {
    if (change.action === "delete") {
      if (await pathExists(change.absolutePath)) {
        await rm(change.absolutePath, { force: true });
      }
      continue;
    }

    await mkdir(path.dirname(change.absolutePath), { recursive: true });
    await writeFile(change.absolutePath, change.nextContent, "utf8");
  }
}
