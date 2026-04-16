import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createManifest, isOgProject, readManifest } from "@og/core";
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

  if (normalizedSlashes.startsWith("/")) {
    throw new Error(`Generated file path must be relative: '${rawPath}'.`);
  }

  const normalized = path.posix.normalize(normalizedSlashes);

  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error(`Generated file path is invalid: '${rawPath}'.`);
  }

  if (normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Generated file path escapes project directory: '${rawPath}'.`);
  }

  if (normalized === ".og" || normalized.startsWith(".og/")) {
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
    return `export default function App() {\n  return (\n    <main style={{ padding: 24 }}>\n      <h1>${mode === "create" ? "New app" : "Updated app"}</h1>\n      <p>Prompt: ${prompt}</p>\n      <p>Template: ${template}</p>\n    </main>\n  );\n}\n`;
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

export class ComputeGenerationProvider implements GenerationProvider {
  constructor(
    private readonly options: {
      endpoint: string;
      token: string;
      fetchImpl?: typeof fetch;
    }
  ) {}

  async generatePlan(request: GenerationRequest): Promise<unknown> {
    if (!isHttpEndpoint(this.options.endpoint)) {
      return createMockPlan(request);
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.options.endpoint}/v1/generate-plan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        mode: request.mode,
        prompt: request.prompt,
        model: request.model,
        template: request.template,
        projectName: request.projectName,
        files: request.existingFiles
      })
    });

    if (!response.ok) {
      throw new Error(`Generation request failed with status ${response.status}.`);
    }

    return (await response.json()) as unknown;
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

  const providerResult = await options.provider.generatePlan({
    mode: options.mode,
    prompt: options.prompt,
    template,
    model,
    projectName,
    existingFiles
  });

  const structuredPlan = validateStructuredPatchPlan(providerResult);

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
