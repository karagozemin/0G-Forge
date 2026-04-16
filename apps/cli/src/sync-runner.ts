import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type OgManifest,
  getHistoryPath,
  getManifestPath,
  getOgDirPath,
  isOgProject,
  readManifest,
  validateManifest
} from "@og/core";
import {
  createLocalFileSyncProvider,
  type SyncArtifactMetadata,
  type SyncHistoryEntry,
  type SyncPayload,
  type SyncProvider,
  type SyncProviderInfo
} from "@og/storage";
import {
  OG_PROJECT_MANIFEST_MISSING_MESSAGE,
  OG_PROJECT_NOT_FOUND_MESSAGE,
  pathExists,
  resolveOgProjectRoot
} from "./runtime-utils.js";

const SKIPPED_ARTIFACT_DIRS = new Set([
  ".git",
  ".og",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".pnpm-store",
  ".vercel/output"
]);

const MAX_ARTIFACTS = 300;
const MAX_FILE_BYTES = 2_000_000;
const ARTIFACT_META_FILE_NAME = "artifacts-metadata.json";

export type ResolvedSyncProject = {
  projectDir: string;
  manifest: OgManifest;
};

export type PushSyncResult = {
  providerInfo: SyncProviderInfo;
  projectPath: string;
  historyCount: number;
  artifactCount: number;
  payload: SyncPayload;
};

export type PullSyncResult = {
  providerInfo: SyncProviderInfo;
  projectPath: string;
  historyCount: number;
  artifactCount: number;
  manifestChanged: boolean;
  payloadSyncedAt: string;
};

function resolveProjectKey(manifest: OgManifest): string {
  return `project:${manifest.projectName}:${manifest.template}:${manifest.deployTarget}`;
}

export async function resolveSyncProject(startDir: string): Promise<ResolvedSyncProject> {
  const projectDir = await resolveOgProjectRoot(startDir);
  if (!projectDir) {
    throw new Error(OG_PROJECT_NOT_FOUND_MESSAGE);
  }

  if (!(await isOgProject(projectDir))) {
    throw new Error(OG_PROJECT_MANIFEST_MISSING_MESSAGE);
  }

  const manifest = await readManifest(projectDir);
  return {
    projectDir,
    manifest
  };
}

function parseHistoryLines(raw: string): SyncHistoryEntry[] {
  const entries: SyncHistoryEntry[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") {
      continue;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.type !== "string" || typeof record.timestamp !== "string") {
      continue;
    }

    const payload =
      record.payload && typeof record.payload === "object"
        ? (record.payload as Record<string, unknown>)
        : undefined;

    entries.push({
      type: record.type,
      timestamp: record.timestamp,
      payload
    });
  }

  return entries;
}

async function readHistoryEntries(projectDir: string): Promise<SyncHistoryEntry[]> {
  const historyPath = getHistoryPath(projectDir);
  if (!(await pathExists(historyPath))) {
    return [];
  }

  const raw = await readFile(historyPath, "utf8");
  return parseHistoryLines(raw);
}

function extractDeployUrl(historyEntries: SyncHistoryEntry[]): string | undefined {
  for (let index = historyEntries.length - 1; index >= 0; index -= 1) {
    const payload = historyEntries[index].payload;
    if (!payload) {
      continue;
    }

    const value = payload.deploymentUrl;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

async function collectArtifactMetadata(
  projectDir: string,
  historyEntries: SyncHistoryEntry[]
): Promise<SyncArtifactMetadata[]> {
  const artifacts: SyncArtifactMetadata[] = [];
  const deployUrl = extractDeployUrl(historyEntries);

  async function walk(currentDir: string): Promise<void> {
    if (artifacts.length >= MAX_ARTIFACTS) {
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (artifacts.length >= MAX_ARTIFACTS) {
        return;
      }

      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(projectDir, absolutePath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        if (SKIPPED_ARTIFACT_DIRS.has(relativePath) || SKIPPED_ARTIFACT_DIRS.has(entry.name)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      if (fileStat.size > MAX_FILE_BYTES) {
        continue;
      }

      artifacts.push({
        path: relativePath,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
        deployUrl
      });
    }
  }

  await walk(projectDir);

  return artifacts;
}

export async function buildSyncPayload(projectDir: string): Promise<SyncPayload> {
  const manifest = await readManifest(projectDir);
  const historyEntries = await readHistoryEntries(projectDir);
  const artifacts = await collectArtifactMetadata(projectDir, historyEntries);

  return {
    manifest,
    historyEntries,
    artifacts,
    syncedAt: new Date().toISOString()
  };
}

function serializeHistoryEntries(entries: SyncHistoryEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length > 0 ? "\n" : "");
}

function mergeHistoryEntries(
  localEntries: SyncHistoryEntry[],
  remoteEntries: SyncHistoryEntry[]
): SyncHistoryEntry[] {
  const seen = new Set<string>();
  const merged: SyncHistoryEntry[] = [];

  const append = (entry: SyncHistoryEntry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(entry);
  };

  for (const entry of localEntries) {
    append(entry);
  }

  for (const entry of remoteEntries) {
    append(entry);
  }

  merged.sort((first, second) => first.timestamp.localeCompare(second.timestamp));
  return merged;
}

function createSyncProvider(customProvider?: SyncProvider): SyncProvider {
  return customProvider ?? createLocalFileSyncProvider();
}

function validateRemotePayload(input: SyncPayload): SyncPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Remote sync payload is invalid.");
  }

  if (!Array.isArray(input.historyEntries)) {
    throw new Error("Remote sync payload is invalid: historyEntries must be an array.");
  }

  if (!Array.isArray(input.artifacts)) {
    throw new Error("Remote sync payload is invalid: artifacts must be an array.");
  }

  if (typeof input.syncedAt !== "string" || !input.syncedAt.trim()) {
    throw new Error("Remote sync payload is invalid: syncedAt is missing.");
  }

  for (const [index, entry] of input.historyEntries.entries()) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Remote sync payload is invalid: historyEntries[${index}] must be an object.`);
    }

    if (typeof entry.type !== "string" || !entry.type.trim()) {
      throw new Error(`Remote sync payload is invalid: historyEntries[${index}].type is required.`);
    }

    if (typeof entry.timestamp !== "string" || !entry.timestamp.trim()) {
      throw new Error(`Remote sync payload is invalid: historyEntries[${index}].timestamp is required.`);
    }
  }

  for (const [index, artifact] of input.artifacts.entries()) {
    if (!artifact || typeof artifact !== "object") {
      throw new Error(`Remote sync payload is invalid: artifacts[${index}] must be an object.`);
    }

    if (typeof artifact.path !== "string" || !artifact.path.trim()) {
      throw new Error(`Remote sync payload is invalid: artifacts[${index}].path is required.`);
    }

    const normalizedPath = artifact.path.replace(/\\/g, "/");
    if (
      normalizedPath.startsWith("/") ||
      normalizedPath.startsWith("../") ||
      normalizedPath.includes("/../")
    ) {
      throw new Error(`Remote sync payload is invalid: artifacts[${index}].path escapes project scope.`);
    }

    if (typeof artifact.size !== "number" || !Number.isFinite(artifact.size) || artifact.size < 0) {
      throw new Error(`Remote sync payload is invalid: artifacts[${index}].size must be a non-negative number.`);
    }

    if (typeof artifact.modifiedAt !== "string" || !artifact.modifiedAt.trim()) {
      throw new Error(`Remote sync payload is invalid: artifacts[${index}].modifiedAt is required.`);
    }
  }

  const manifest = validateManifest(input.manifest);

  return {
    ...input,
    manifest
  };
}

function getArtifactMetaPath(projectDir: string): string {
  return path.join(getOgDirPath(projectDir), ARTIFACT_META_FILE_NAME);
}

export async function pushSyncPayload(
  projectDir: string,
  provider?: SyncProvider
): Promise<PushSyncResult> {
  const syncProvider = createSyncProvider(provider);
  const providerInfo = syncProvider.getInfo();
  const payload = await buildSyncPayload(projectDir);

  const projectKey = resolveProjectKey(await readManifest(projectDir));
  await syncProvider.push(projectKey, payload);

  return {
    providerInfo,
    projectPath: projectDir,
    historyCount: payload.historyEntries.length,
    artifactCount: payload.artifacts.length,
    payload
  };
}

export async function pullSyncPayload(
  projectDir: string,
  provider?: SyncProvider
): Promise<PullSyncResult> {
  const syncProvider = createSyncProvider(provider);
  const providerInfo = syncProvider.getInfo();

  const localManifest = await readManifest(projectDir);
  const projectKey = resolveProjectKey(localManifest);

  const remotePayload = await syncProvider.pull(projectKey);
  if (!remotePayload) {
    throw new Error("No remote sync payload found for this project.");
  }

  const validatedPayload = validateRemotePayload(remotePayload);

  const manifestPath = getManifestPath(projectDir);
  const historyPath = getHistoryPath(projectDir);
  const artifactMetaPath = getArtifactMetaPath(projectDir);

  const manifestChanged = JSON.stringify(localManifest) !== JSON.stringify(validatedPayload.manifest);
  if (manifestChanged) {
    await writeFile(manifestPath, `${JSON.stringify(validatedPayload.manifest, null, 2)}\n`, "utf8");
  }

  const localHistoryEntries = await readHistoryEntries(projectDir);
  const mergedHistory = mergeHistoryEntries(localHistoryEntries, validatedPayload.historyEntries);
  await writeFile(historyPath, serializeHistoryEntries(mergedHistory), "utf8");

  await writeFile(artifactMetaPath, `${JSON.stringify(validatedPayload.artifacts, null, 2)}\n`, "utf8");

  return {
    providerInfo,
    projectPath: projectDir,
    historyCount: mergedHistory.length,
    artifactCount: validatedPayload.artifacts.length,
    manifestChanged,
    payloadSyncedAt: validatedPayload.syncedAt
  };
}
