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

	return {
		version: 1,
		projects: store.projects
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
		const store = await readStore(this.storePath);
		store.projects[projectKey] = {
			payload,
			updatedAt: new Date().toISOString()
		};

		await writeStore(this.storePath, store);
	}

	async pull(projectKey: string): Promise<SyncPayload | null> {
		const store = await readStore(this.storePath);
		const entry = store.projects[projectKey];
		if (!entry) {
			return null;
		}

		return entry.payload;
	}
}

export function createLocalFileSyncProvider(
	storePath: string = getSyncStorePath()
): SyncProvider {
	return new LocalFileSyncProvider(storePath);
}
