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
const CHAT_COMPLETION_PATHS = ["/chat/completions", "/v1/chat/completions"] as const;
const MAX_TRANSIENT_RETRIES = 1;
const INITIAL_RETRY_DELAY_MS = 1200;
const MAX_RETRY_DELAY_MS = 4000;

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

type GenerationRuntimeErrorCode =
  | "unsupported-endpoint"
  | "unauthorized"
  | "forbidden"
  | "rate-limit"
  | "unsupported-model"
  | "invalid-request"
  | "invalid-response"
  | "provider-unavailable"
  | "timeout"
  | "network";

class GenerationProviderRuntimeError extends Error {
  constructor(
    readonly code: GenerationRuntimeErrorCode,
    message: string,
    readonly retryable: boolean = false,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "GenerationProviderRuntimeError";
  }
}

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

function isRateLimitMessage(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return /(rate limit|too many requests|retry after|quota exceeded)/i.test(message);
}

function isUnsupportedModelMessage(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return /(model not supported|requested\s+'.+'\s*,\s*only\s+'.+'\s+is available|unknown model|invalid model)/i.test(message);
}

function isTransientNetworkMessage(message: string): boolean {
  return /(network|socket|econnreset|etimedout|enotfound|eai_again|fetch failed|connection reset|connection refused)/i.test(message);
}

function parseRetryAfterSeconds(response: Response, providerMessage: string | undefined): number | undefined {
  const header = response.headers.get("retry-after");
  if (header) {
    const numeric = Number.parseInt(header, 10);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }

    const dateValue = new Date(header);
    const diffMs = dateValue.getTime() - Date.now();
    if (Number.isFinite(diffMs) && diffMs > 0) {
      return Math.ceil(diffMs / 1000);
    }
  }

  if (!providerMessage) {
    return undefined;
  }

  const match = providerMessage.match(/(?:retry after|try again in)\s*(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?/i);
  if (!match) {
    return undefined;
  }

  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  const unit = (match[2] || "s").toLowerCase();
  if (unit.startsWith("h")) {
    return value * 3600;
  }

  if (unit.startsWith("m")) {
    return value * 60;
  }

  return value;
}

function formatRetryAfter(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) {
    return "Retry later.";
  }

  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return `Retry after about ${hours}h.`;
  }

  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `Retry after about ${minutes}m.`;
  }

  return `Retry after about ${seconds}s.`;
}

function computeRetryDelayMs(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY_MS * (attempt + 1);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function formatGenerationProviderFailure(error: unknown): string {
  if (error instanceof GenerationProviderRuntimeError) {
    return error.message;
  }

  const message = error instanceof Error ? error.message : String(error);
  return `Generation provider request failed: ${message}`;
}

function isUnsupportedRoute(responseStatus: number, providerMessage: string | undefined): boolean {
  if (responseStatus === 404) {
    return true;
  }

  if (!providerMessage) {
    return false;
  }

  return /(unsupported endpoint|endpoint not supported|route not found|not implemented)/i.test(providerMessage);
}

function buildGenerationSystemPrompt(): string {
  return [
    "You are a strict code patch planner for a local project.",
    "Return ONLY valid JSON.",
    "Response schema:",
    "{",
    '  "summary": string,',
    '  "template": string,',
    '  "files": [',
    "    {",
    '      "path": string,',
    '      "action": "create" | "update" | "delete",',
    '      "content"?: string',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- paths must be relative and must not target .og",
    "- for delete actions omit content",
    "- for create/update include full file content",
    "- keep output minimal and deterministic"
  ].join("\n");
}

function buildGenerationUserPrompt(request: GenerationRequest): string {
  const existingFilesPreview = request.existingFiles.slice(0, 80).map((file) => ({
    path: file.path,
    content: file.content
  }));

  return JSON.stringify(
    {
      mode: request.mode,
      prompt: request.prompt,
      template: request.template,
      model: request.model,
      projectName: request.projectName,
      existingFiles: existingFilesPreview
    },
    null,
    2
  );
}

function extractJsonFromCompletion(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Generation provider returned empty completion content.");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const objectSlice = candidate.slice(firstBrace, lastBrace + 1);
      return JSON.parse(objectSlice) as unknown;
    }

    throw new Error("Generation provider completion content is not valid JSON.");
  }
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
      model: request.model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: buildGenerationSystemPrompt()
        },
        {
          role: "user",
          content: buildGenerationUserPrompt(request)
        }
      ]
    };

    let lastError: Error | undefined;
    for (const routePath of CHAT_COMPLETION_PATHS) {
      let unsupportedRoute = false;

      for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
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
            const providerMessage = parseProviderErrorMessage(parsedBody);

            if (isUnsupportedRoute(response.status, providerMessage)) {
              lastError = new Error(`Generation route not found at ${routePath}.`);
              unsupportedRoute = true;
              break;
            }

            if (response.status === 401) {
              throw new GenerationProviderRuntimeError(
                "unauthorized",
                providerMessage || "Generation request unauthorized. Check token with `og login`.",
                false
              );
            }

            if (response.status === 403) {
              throw new GenerationProviderRuntimeError(
                "forbidden",
                providerMessage || `Generation forbidden for model '${request.model}'. Verify provider permissions and endpoint mapping.`,
                false
              );
            }

            if (response.status === 429 || isRateLimitMessage(providerMessage)) {
              const retryAfterSeconds = parseRetryAfterSeconds(response, providerMessage);
              throw new GenerationProviderRuntimeError(
                "rate-limit",
                `${providerMessage || "Provider rate limit exceeded."} ${formatRetryAfter(retryAfterSeconds)} No automatic retry was attempted for rate limits.`,
                false,
                retryAfterSeconds
              );
            }

            if (isUnsupportedModelMessage(providerMessage)) {
              throw new GenerationProviderRuntimeError(
                "unsupported-model",
                `${providerMessage || `Model '${request.model}' is not supported by provider.`} Use '--model <provider-native-model-id>' (for example '--model deepseek/deepseek-chat-v3-0324').`,
                false
              );
            }

            if (response.status >= 500 || response.status === 408) {
              if (attempt < MAX_TRANSIENT_RETRIES) {
                await sleep(computeRetryDelayMs(attempt));
                continue;
              }

              throw new GenerationProviderRuntimeError(
                "provider-unavailable",
                `${providerMessage || `Provider temporary failure (${response.status}).`} Retry later or use a shorter prompt.`,
                true
              );
            }

            if (response.status === 400 || response.status === 422) {
              throw new GenerationProviderRuntimeError(
                "invalid-request",
                `${providerMessage || "Provider rejected this request as invalid."} No automatic retry was attempted because the request appears invalid.`,
                false
              );
            }

            throw new GenerationProviderRuntimeError(
              "invalid-request",
              providerMessage || `Generation request failed with status ${response.status}.`,
              false
            );
          }

          if (!rawBody.trim() || !parsedBody || typeof parsedBody !== "object") {
            throw new GenerationProviderRuntimeError(
              "invalid-response",
              "Generation provider returned an empty or invalid response body.",
              false
            );
          }

          const completion = parsedBody as {
            choices?: Array<{
              message?: {
                content?: unknown;
              };
              finish_reason?: unknown;
            }>;
          };

          const firstChoice = completion.choices?.[0];
          const content = firstChoice?.message?.content;

          if (typeof content !== "string" || !content.trim()) {
            throw new GenerationProviderRuntimeError(
              "invalid-response",
              "Generation provider response did not include completion text content.",
              false
            );
          }

          return extractJsonFromCompletion(content);
        } catch (error) {
          if (error instanceof GenerationProviderRuntimeError) {
            throw error;
          }

          if (error instanceof Error && error.name === "AbortError") {
            if (attempt < MAX_TRANSIENT_RETRIES) {
              await sleep(computeRetryDelayMs(attempt));
              continue;
            }

            throw new GenerationProviderRuntimeError(
              "timeout",
              `Generation request timed out after ${requestTimeoutMs}ms. Retry later or try a simpler prompt.`,
              true
            );
          }

          const message = error instanceof Error ? error.message : String(error);

          if (isTransientNetworkMessage(message) && attempt < MAX_TRANSIENT_RETRIES) {
            await sleep(computeRetryDelayMs(attempt));
            continue;
          }

          if (isTransientNetworkMessage(message)) {
            throw new GenerationProviderRuntimeError(
              "network",
              `Generation request failed due to transient network/provider connectivity issue. Retry later. Details: ${message}`,
              true
            );
          }

          throw new GenerationProviderRuntimeError(
            "invalid-request",
            message,
            false
          );
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (unsupportedRoute) {
        continue;
      }
    }

    throw new GenerationProviderRuntimeError(
      "unsupported-endpoint",
      `Generation request failed across provider routes: ${CHAT_COMPLETION_PATHS.join(", ")}. ${lastError ? `Last error: ${lastError.message}` : ""} Ensure endpoint points to an OpenAI-compatible proxy path (for example '.../v1/proxy').`.trim(),
      false
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
    throw new Error(formatGenerationProviderFailure(error));
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
