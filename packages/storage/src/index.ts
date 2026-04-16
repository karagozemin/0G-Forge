import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const name = "@og/storage";

export const DEFAULT_SYNC_PROVIDER = "local-file";
export const HTTP_SYNC_PROVIDER = "http";
const DEFAULT_HTTP_SYNC_TIMEOUT_MS = 15_000;

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

type HttpSyncProviderOptions = {
	endpoint: string;
	token: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeEndpoint(endpoint: string): string {
	return endpoint.trim().replace(/\/+$/, "");
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

function parseProviderErrorMessage(input: unknown): string | undefined {
	if (!isObjectRecord(input)) {
		return undefined;
	}

	if (typeof input.message === "string" && input.message.trim()) {
		return input.message.trim();
	}

	if (typeof input.error === "string" && input.error.trim()) {
		return input.error.trim();
	}

	const nested = input.error;
	if (nested && isObjectRecord(nested) && typeof nested.message === "string" && nested.message.trim()) {
		return nested.message.trim();
	}

	return undefined;
}

class HttpSyncProvider implements SyncProvider {
	private readonly endpoint: string;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(private readonly options: HttpSyncProviderOptions) {
		this.endpoint = normalizeEndpoint(options.endpoint);
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_SYNC_TIMEOUT_MS;
	}

	getInfo(): SyncProviderInfo {
		return {
			name: HTTP_SYNC_PROVIDER,
			storagePath: this.endpoint
		};
	}

	private async request(pathSuffix: string, init: RequestInit): Promise<unknown> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetchImpl(`${this.endpoint}${pathSuffix}`, {
				...init,
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${this.options.token}`,
					...(init.body ? { "Content-Type": "application/json" } : {}),
					...(init.headers ?? {})
				},
				signal: controller.signal
			});

			const raw = await response.text();
			const parsed = raw.trim() ? (JSON.parse(raw) as unknown) : undefined;

			if (!response.ok) {
				const providerMessage = parseProviderErrorMessage(parsed);

				if (response.status === 401) {
					throw new SyncProviderError(
						providerMessage || "Sync provider unauthorized. Check OG_SYNC_TOKEN.",
						"unauthorized",
						response.status
					);
				}

				if (response.status === 403) {
					throw new SyncProviderError(
						providerMessage || "Sync provider rejected this request (forbidden).",
						"forbidden",
						response.status
					);
				}

				if (response.status === 404) {
					throw new SyncProviderError(
						providerMessage || "Remote sync payload not found.",
						"not-found",
						response.status
					);
				}

				throw new SyncProviderError(
					providerMessage || `Sync request failed with status ${response.status}.`,
					"request-failed",
					response.status
				);
			}

			return parsed;
		} catch (error) {
			if (error instanceof SyncProviderError) {
				throw error;
			}

			if (error instanceof Error && error.name === "AbortError") {
				throw new SyncProviderError(
					`Sync provider request timed out after ${this.timeoutMs}ms.`,
					"request-timeout"
				);
			}

			const message = error instanceof Error ? error.message : String(error);
			throw new SyncProviderError(
				`Sync provider request failed: ${message}`,
				"request-failed"
			);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async push(projectKey: string, payload: SyncPayload): Promise<void> {
		const key = validateProjectKey(projectKey);
		const validatedPayload = validateSyncPayload(payload);

		await this.request("/v1/sync/payload", {
			method: "POST",
			body: JSON.stringify({
				projectKey: key,
				payload: validatedPayload
			})
		});
	}

	async pull(projectKey: string): Promise<SyncPayload | null> {
		const key = validateProjectKey(projectKey);

		const response = await this.request(`/v1/sync/payload?projectKey=${encodeURIComponent(key)}`, {
			method: "GET"
		});

		if (!response || !isObjectRecord(response)) {
			throw new SyncProviderError(
				"Sync provider returned an invalid payload envelope.",
				"invalid-response"
			);
		}

		if (response.payload === null) {
			return null;
		}

		return validateSyncPayload(response.payload);
	}
}

export function createLocalFileSyncProvider(
	storePath: string = getSyncStorePath()
): SyncProvider {
	return new LocalFileSyncProvider(storePath);
}

export function createHttpSyncProvider(options: HttpSyncProviderOptions): SyncProvider {
	if (!options.endpoint?.trim()) {
		throw new SyncProviderError("OG_SYNC_ENDPOINT is required for http sync provider.", "invalid-payload");
	}

	if (!options.token?.trim()) {
		throw new SyncProviderError("OG_SYNC_TOKEN is required for http sync provider.", "invalid-payload");
	}

	if (!/^https?:\/\//.test(options.endpoint.trim())) {
		throw new SyncProviderError(
			`Unsupported sync endpoint '${options.endpoint}'. Use an http(s) endpoint.`,
			"invalid-payload"
		);
	}

	return new HttpSyncProvider(options);
}

export function createSyncProviderFromEnv(): SyncProvider {
	const selectedProvider = process.env.OG_SYNC_PROVIDER?.trim() || DEFAULT_SYNC_PROVIDER;

	if (selectedProvider === HTTP_SYNC_PROVIDER) {
		return createHttpSyncProvider({
			endpoint: process.env.OG_SYNC_ENDPOINT ?? "",
			token: process.env.OG_SYNC_TOKEN ?? ""
		});
	}

	if (selectedProvider !== DEFAULT_SYNC_PROVIDER) {
		throw new SyncProviderError(
			`Unsupported OG_SYNC_PROVIDER '${selectedProvider}'. Supported values: ${DEFAULT_SYNC_PROVIDER}, ${HTTP_SYNC_PROVIDER}.`,
			"invalid-payload"
		);
	}

	return createLocalFileSyncProvider();
}
