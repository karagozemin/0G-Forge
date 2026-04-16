import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const OG_DIR_NAME = ".og";
export const MANIFEST_FILE_NAME = "manifest.json";
export const HISTORY_FILE_NAME = "history.ndjson";

export const manifestSchema = z.object({
  projectName: z.string().min(1),
  template: z.string().min(1),
  defaultModel: z.string().min(1),
  createdAt: z.string().datetime(),
  deployTarget: z.literal("vercel"),
  syncEnabled: z.boolean()
});

export type OgManifest = z.infer<typeof manifestSchema>;

export type CreateManifestInput = {
  projectName: string;
  template: string;
  defaultModel: string;
  deployTarget?: "vercel";
  syncEnabled?: boolean;
};

export type ManifestPatch = Partial<
  Omit<OgManifest, "createdAt"> & {
    createdAt: string;
  }
>;

export function getOgDirPath(projectDir: string = process.cwd()): string {
  return path.join(projectDir, OG_DIR_NAME);
}

export function getManifestPath(projectDir: string = process.cwd()): string {
  return path.join(getOgDirPath(projectDir), MANIFEST_FILE_NAME);
}

export function getHistoryPath(projectDir: string = process.cwd()): string {
  return path.join(getOgDirPath(projectDir), HISTORY_FILE_NAME);
}

export function validateManifest(input: unknown): OgManifest {
  return manifestSchema.parse(input);
}

export async function isOgProject(projectDir: string = process.cwd()): Promise<boolean> {
  try {
    await access(getManifestPath(projectDir));
    return true;
  } catch {
    return false;
  }
}

export async function readManifest(projectDir: string = process.cwd()): Promise<OgManifest> {
  const manifestPath = getManifestPath(projectDir);
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return validateManifest(parsed);
}

export async function createManifest(
  input: CreateManifestInput,
  projectDir: string = process.cwd()
): Promise<OgManifest> {
  const ogDirPath = getOgDirPath(projectDir);
  const manifestPath = getManifestPath(projectDir);

  await mkdir(ogDirPath, { recursive: true });

  const manifest = validateManifest({
    projectName: input.projectName,
    template: input.template,
    defaultModel: input.defaultModel,
    createdAt: new Date().toISOString(),
    deployTarget: input.deployTarget ?? "vercel",
    syncEnabled: input.syncEnabled ?? false
  });

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await ensureHistoryFile(projectDir);

  await appendHistoryLine(
    {
      type: "manifest.created",
      timestamp: new Date().toISOString(),
      payload: {
        projectName: manifest.projectName,
        template: manifest.template,
        deployTarget: manifest.deployTarget
      }
    },
    projectDir
  );

  return manifest;
}

export async function updateManifest(
  patch: ManifestPatch,
  projectDir: string = process.cwd()
): Promise<OgManifest> {
  const current = await readManifest(projectDir);

  const next = validateManifest({
    ...current,
    ...patch
  });

  await writeFile(getManifestPath(projectDir), JSON.stringify(next, null, 2) + "\n", "utf8");

  await appendHistoryLine(
    {
      type: "manifest.updated",
      timestamp: new Date().toISOString(),
      payload: {
        keys: Object.keys(patch)
      }
    },
    projectDir
  );

  return next;
}

type HistoryLine = {
  type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export async function ensureHistoryFile(projectDir: string = process.cwd()): Promise<string> {
  const historyPath = getHistoryPath(projectDir);
  try {
    await access(historyPath);
    return historyPath;
  } catch {
    await writeFile(historyPath, "", "utf8");
    return historyPath;
  }
}

export async function appendHistoryLine(
  line: HistoryLine,
  projectDir: string = process.cwd()
): Promise<void> {
  const historyPath = await ensureHistoryFile(projectDir);
  const serialized = JSON.stringify(line);
  await appendFile(historyPath, `${serialized}\n`, "utf8");
}
