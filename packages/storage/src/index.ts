import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const name = "@og/storage";

export const DEFAULT_SYNC_PROVIDER = "local-file";

export type SyncArtifactMetadata = {
	path: string;
	size: number;
	modifiedAt: string;
	deployUrl?: string;
};

export type SyncHistoryEntry = {
	type: string;
	timestamp: string;
	payload?: Record<string, unknown>;
};

export type SyncPayload = {
	manifest: Record<string, unknown>;
	historyEntries: SyncHistoryEntry[];
	artifacts: SyncArtifactMetadata[];
	syncedAt: string;
};

export type SyncProviderInfo = {
	name: string;
	storagePath: string;
};

export type SyncProvider = {
	getInfo(): SyncProviderInfo;
	push(projectKey: string, payload: SyncPayload): Promise<void>;
	pull(projectKey: string): Promise<SyncPayload | null>;
};

export class SyncProviderError extends Error {
	constructor(
		message: string,
		readonly code:
			| "invalid-project-key"
			| "invalid-payload"
			| "request-timeout"
			| "request-failed"
			| "unauthorized"
			| "forbidden"
			| "not-found"
			| "invalid-response",
		readonly status?: number
	) {
		super(message);
		this.name = "SyncProviderError";
	}
}

type SyncStoreFile = {
	version: 1;
	projects: Record<
		string,
		{
			payload: SyncPayload;
			updatedAt: string;
		}
	>;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateProjectKey(projectKey: string): string {
	const trimmed = projectKey.trim();
	if (!trimmed) {
		throw new SyncProviderError("Sync project key cannot be empty.", "invalid-project-key");
	}

	if (trimmed.includes("\0")) {
		throw new SyncProviderError("Sync project key cannot contain NUL bytes.", "invalid-project-key");
	}

	return trimmed;
}

function validateSyncHistoryEntries(input: unknown): SyncHistoryEntry[] {
	if (!Array.isArray(input)) {
		throw new SyncProviderError("Sync payload historyEntries must be an array.", "invalid-payload");
	}

	return input.map((entry, index) => {
		if (!isObjectRecord(entry)) {
			throw new SyncProviderError(
				`Sync payload historyEntries[${index}] must be an object.`,
				"invalid-payload"
			);
		}

		if (typeof entry.type !== "string" || !entry.type.trim()) {
			throw new SyncProviderError(
				`Sync payload historyEntries[${index}].type is required.`,
				"invalid-payload"
			);
		}

		if (typeof entry.timestamp !== "string" || !entry.timestamp.trim()) {
			throw new SyncProviderError(
				`Sync payload historyEntries[${index}].timestamp is required.`,
				"invalid-payload"
			);
		}

		const payload =
			entry.payload && isObjectRecord(entry.payload)
				? (entry.payload as Record<string, unknown>)
				: undefined;

		return {
			type: entry.type,
			timestamp: entry.timestamp,
			payload
		};
	});
}

function validateSyncArtifacts(input: unknown): SyncArtifactMetadata[] {
	if (!Array.isArray(input)) {
		throw new SyncProviderError("Sync payload artifacts must be an array.", "invalid-payload");
	}

	return input.map((artifact, index) => {
		if (!isObjectRecord(artifact)) {
			throw new SyncProviderError(
				`Sync payload artifacts[${index}] must be an object.`,
				"invalid-payload"
			);
		}

		if (typeof artifact.path !== "string" || !artifact.path.trim()) {
			throw new SyncProviderError(
				`Sync payload artifacts[${index}].path is required.`,
				"invalid-payload"
			);
		}

		const normalizedPath = artifact.path.replace(/\\/g, "/");
		if (
			normalizedPath.startsWith("/") ||
			normalizedPath.startsWith("../") ||
			normalizedPath.includes("/../")
		) {
			throw new SyncProviderError(
				`Sync payload artifacts[${index}].path escapes project scope.`,
				"invalid-payload"
			);
		}

		if (
			typeof artifact.size !== "number" ||
			!Number.isFinite(artifact.size) ||
			artifact.size < 0
		) {
			throw new SyncProviderError(
				`Sync payload artifacts[${index}].size must be a non-negative number.`,
				"invalid-payload"
			);
		}

		if (typeof artifact.modifiedAt !== "string" || !artifact.modifiedAt.trim()) {
			throw new SyncProviderError(
				`Sync payload artifacts[${index}].modifiedAt is required.`,
				"invalid-payload"
			);
		}

		return {
			path: normalizedPath,
			size: artifact.size,
			modifiedAt: artifact.modifiedAt,
			deployUrl:
				typeof artifact.deployUrl === "string" && artifact.deployUrl.trim()
					? artifact.deployUrl.trim()
					: undefined
		};
	});
}

export function validateSyncPayload(input: unknown): SyncPayload {
	if (!isObjectRecord(input)) {
		throw new SyncProviderError("Sync payload must be an object.", "invalid-payload");
	}

	if (!isObjectRecord(input.manifest)) {
		throw new SyncProviderError("Sync payload manifest must be an object.", "invalid-payload");
	}

	if (typeof input.syncedAt !== "string" || !input.syncedAt.trim()) {
		throw new SyncProviderError("Sync payload syncedAt is required.", "invalid-payload");
	}

	return {
		manifest: input.manifest,
		historyEntries: validateSyncHistoryEntries(input.historyEntries),
		artifacts: validateSyncArtifacts(input.artifacts),
		syncedAt: input.syncedAt
	};
}

function getBaseConfigDir(): string {
	if (process.platform === "win32" && process.env.APPDATA) {
		return process.env.APPDATA;
	}

	if (process.env.XDG_CONFIG_HOME) {
		return process.env.XDG_CONFIG_HOME;
	}

	return path.join(os.homedir(), ".config");
}

function getSyncStorePath(): string {
	return path.join(getBaseConfigDir(), "og", "sync-store.json");
}

async function readStore(storePath: string): Promise<SyncStoreFile> {
	try {
		await access(storePath);
	} catch {
		return {
			version: 1,
			projects: {}
		};
	}

	const raw = await readFile(storePath, "utf8");
	const parsed = JSON.parse(raw) as unknown;

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Sync store is corrupted: expected object.");
	}

	const store = parsed as Partial<SyncStoreFile>;
	if (store.version !== 1 || !store.projects || typeof store.projects !== "object") {
		throw new Error("Sync store is corrupted: invalid schema.");
	}

	const projects: SyncStoreFile["projects"] = {};
	for (const [projectKey, projectValue] of Object.entries(store.projects)) {
		if (!projectValue || typeof projectValue !== "object") {
			continue;
		}

		const entry = projectValue as { payload?: unknown; updatedAt?: unknown };
		if (typeof entry.updatedAt !== "string" || !entry.updatedAt.trim()) {
			continue;
		}

		projects[validateProjectKey(projectKey)] = {
			payload: validateSyncPayload(entry.payload),
			updatedAt: entry.updatedAt
		};
	}

	return {
		version: 1,
		projects
	};
}

async function writeStore(storePath: string, store: SyncStoreFile): Promise<void> {
	await mkdir(path.dirname(storePath), { recursive: true });
	await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

class LocalFileSyncProvider implements SyncProvider {
	constructor(private readonly storePath: string) {}

	getInfo(): SyncProviderInfo {
		return {
			name: DEFAULT_SYNC_PROVIDER,
			storagePath: this.storePath
		};
	}

	async push(projectKey: string, payload: SyncPayload): Promise<void> {
		const key = validateProjectKey(projectKey);
		const validatedPayload = validateSyncPayload(payload);

		const store = await readStore(this.storePath);
		store.projects[key] = {
			payload: validatedPayload,
			updatedAt: new Date().toISOString()
		};

		await writeStore(this.storePath, store);
	}

	async pull(projectKey: string): Promise<SyncPayload | null> {
		const key = validateProjectKey(projectKey);
		const store = await readStore(this.storePath);
		const entry = store.projects[key];
		if (!entry) {
			return null;
		}

		return validateSyncPayload(entry.payload);
	}
}

export function createLocalFileSyncProvider(
	storePath: string = getSyncStorePath()
): SyncProvider {
	return new LocalFileSyncProvider(storePath);
}
