import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const APP_CONFIG_DIR_NAME = "og";
export const AUTH_FILE_NAME = "auth.json";

export type StoredAuth = {
  token: string;
  endpoint: string;
  accountId?: string;
  savedAt: string;
};

function getBaseConfigDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return process.env.APPDATA;
  }

  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }

  return path.join(os.homedir(), ".config");
}

export function getUserConfigDir(): string {
  return path.join(getBaseConfigDir(), APP_CONFIG_DIR_NAME);
}

export function getAuthFilePath(): string {
  return path.join(getUserConfigDir(), AUTH_FILE_NAME);
}

export function maskToken(token: string): string {
  if (token.length <= 8) {
    return "********";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function validateStoredAuth(input: unknown): StoredAuth {
  if (!input || typeof input !== "object") {
    throw new Error("Stored auth payload is invalid.");
  }

  const record = input as Record<string, unknown>;
  const token = record.token;
  const endpoint = record.endpoint;
  const accountId = record.accountId;
  const savedAt = record.savedAt;

  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Stored auth token is invalid.");
  }

  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
    throw new Error("Stored auth endpoint is invalid.");
  }

  if (typeof savedAt !== "string" || savedAt.trim().length === 0) {
    throw new Error("Stored auth timestamp is invalid.");
  }

  if (accountId !== undefined && typeof accountId !== "string") {
    throw new Error("Stored auth accountId is invalid.");
  }

  return {
    token,
    endpoint,
    accountId,
    savedAt
  };
}

export async function readAuth(): Promise<StoredAuth | null> {
  const authFilePath = getAuthFilePath();

  try {
    await access(authFilePath);
  } catch {
    return null;
  }

  const raw = await readFile(authFilePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return validateStoredAuth(parsed);
}

export async function saveAuth(input: {
  token: string;
  endpoint: string;
  accountId?: string;
}): Promise<StoredAuth> {
  if (!input.token.trim()) {
    throw new Error("Token cannot be empty.");
  }

  if (!input.endpoint.trim()) {
    throw new Error("Endpoint cannot be empty.");
  }

  const auth: StoredAuth = {
    token: input.token,
    endpoint: input.endpoint,
    accountId: input.accountId,
    savedAt: new Date().toISOString()
  };

  await mkdir(getUserConfigDir(), { recursive: true });
  await writeFile(getAuthFilePath(), JSON.stringify(auth, null, 2) + "\n", "utf8");
  return auth;
}

export async function clearAuth(): Promise<void> {
  await rm(getAuthFilePath(), { force: true });
}
