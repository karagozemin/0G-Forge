import crypto from "node:crypto";
import { maskToken, type StoredAuth } from "./auth-store.js";

export const MOCK_COMPUTE_ENDPOINT = "mock://local";
export const DEFAULT_COMPUTE_ENDPOINT =
  process.env.OG_COMPUTE_ENDPOINT?.trim() || "https://compute.0g.ai";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type ComputeIdentity = {
  accountId: string;
  endpoint: string;
  tokenPreview: string;
  validationMode: "local" | "remote";
};

export type ComputeModel = {
  id: string;
  name: string;
  contextWindow?: number;
};

export class ComputeProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid-endpoint"
      | "request-timeout"
      | "request-failed"
      | "unauthorized"
      | "forbidden"
      | "not-found"
      | "invalid-response",
    readonly status?: number
  ) {
    super(message);
    this.name = "ComputeProviderError";
  }
}

const MOCK_MODELS: ComputeModel[] = [
  { id: "0g-large", name: "0G Large", contextWindow: 128000 },
  { id: "0g-medium", name: "0G Medium", contextWindow: 64000 },
  { id: "0g-fast", name: "0G Fast", contextWindow: 16000 }
];

type ComputeClientOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
};

function isHttpEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("http://") || endpoint.startsWith("https://");
}

function isMockEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("mock://");
}

function deriveLocalAccountId(token: string): string {
  const hash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 10);
  return `acct_${hash}`;
}

function parseRemoteAccountId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.accountId === "string") {
    return record.accountId;
  }

  if (typeof record.id === "string") {
    return record.id;
  }

  const user = record.user;
  if (user && typeof user === "object") {
    const userRecord = user as Record<string, unknown>;
    if (typeof userRecord.id === "string") {
      return userRecord.id;
    }
  }

  return undefined;
}

function parseContextWindow(record: Record<string, unknown>): number | undefined {
  const candidates = [record.contextWindow, record.context_window, record.maxContextTokens];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return undefined;
}

function parseRemoteModels(payload: unknown): ComputeModel[] {
  if (Array.isArray(payload)) {
    return payload.reduce<ComputeModel[]>((accumulator, item) => {
      if (!item || typeof item !== "object") {
        return accumulator;
      }

      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string") {
        return accumulator;
      }

      accumulator.push({
        id: record.id,
        name: typeof record.name === "string" ? record.name : record.id,
        contextWindow: parseContextWindow(record)
      });

      return accumulator;
    }, []);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return parseRemoteModels(record.models ?? record.data ?? record.items);
  }

  return [];
}

function parseErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  const error = record.error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message.trim();
    }
  }

  return undefined;
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  return isHttpEndpoint(trimmed) ? trimmed.replace(/\/+$/, "") : trimmed;
}

export class ComputeClient {
  private endpoint?: string;
  private fetchImpl: typeof fetch;
  private requestTimeoutMs: number;

  constructor(options: ComputeClientOptions = {}) {
    this.endpoint = options.endpoint ? normalizeEndpoint(options.endpoint) : undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private resolveEndpoint(auth: StoredAuth): string {
    const candidate = auth.endpoint?.trim() || this.endpoint || DEFAULT_COMPUTE_ENDPOINT;
    return normalizeEndpoint(candidate);
  }

  private assertEndpointSupported(endpoint: string): void {
    if (isHttpEndpoint(endpoint) || isMockEndpoint(endpoint)) {
      return;
    }

    throw new ComputeProviderError(
      `Unsupported compute endpoint '${endpoint}'. Use an http(s) endpoint for real integration or '${MOCK_COMPUTE_ENDPOINT}' for local mock mode.`,
      "invalid-endpoint"
    );
  }

  private async requestJson(
    endpoint: string,
    auth: StoredAuth,
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: Record<string, unknown>;
      operationLabel: string;
    }
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(`${endpoint}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      const rawBody = await response.text();
      const parsedBody = rawBody.trim() ? (JSON.parse(rawBody) as unknown) : undefined;

      if (!response.ok) {
        const providerMessage = parseErrorMessage(parsedBody);

        if (response.status === 401) {
          throw new ComputeProviderError(
            providerMessage || "Unauthorized by compute provider. Re-run `og login` with a valid token.",
            "unauthorized",
            response.status
          );
        }

        if (response.status === 403) {
          throw new ComputeProviderError(
            providerMessage || "Compute provider rejected this request (forbidden). Check account/model permissions.",
            "forbidden",
            response.status
          );
        }

        if (response.status === 404) {
          throw new ComputeProviderError(
            providerMessage || `Compute route not found for ${options.operationLabel}: ${path}`,
            "not-found",
            response.status
          );
        }

        throw new ComputeProviderError(
          providerMessage || `${options.operationLabel} failed with status ${response.status}.`,
          "request-failed",
          response.status
        );
      }

      if (!rawBody.trim()) {
        throw new ComputeProviderError(
          `${options.operationLabel} returned an empty response body.`,
          "invalid-response"
        );
      }

      return parsedBody;
    } catch (error) {
      if (error instanceof ComputeProviderError) {
        throw error;
      }

      const abortErrorName = error instanceof Error ? error.name : "";
      if (abortErrorName === "AbortError") {
        throw new ComputeProviderError(
          `${options.operationLabel} timed out after ${this.requestTimeoutMs}ms.`,
          "request-timeout"
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new ComputeProviderError(
        `${options.operationLabel} failed to reach compute provider: ${message}`,
        "request-failed"
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async validateAuthState(auth: StoredAuth): Promise<ComputeIdentity> {
    if (!auth.token.trim()) {
      throw new Error("Missing auth token. Please run `og login`.");
    }

    const endpoint = this.resolveEndpoint(auth);
    this.assertEndpointSupported(endpoint);

    if (isMockEndpoint(endpoint)) {
      return {
        accountId: auth.accountId ?? deriveLocalAccountId(auth.token),
        endpoint,
        tokenPreview: maskToken(auth.token),
        validationMode: "local"
      };
    }

    const data = await this.requestJson(endpoint, auth, "/v1/whoami", {
      operationLabel: "Auth validation"
    });

    const accountId = parseRemoteAccountId(data);
    if (!accountId) {
      throw new ComputeProviderError(
        "Auth validation succeeded but account id could not be parsed from provider response.",
        "invalid-response"
      );
    }

    return {
      accountId,
      endpoint,
      tokenPreview: maskToken(auth.token),
      validationMode: "remote"
    };
  }

  async listAvailableModels(auth: StoredAuth): Promise<ComputeModel[]> {
    const identity = await this.validateAuthState(auth);

    if (identity.validationMode === "local") {
      return MOCK_MODELS;
    }

    const data = await this.requestJson(identity.endpoint, auth, "/v1/models", {
      operationLabel: "Model listing"
    });

    const models = parseRemoteModels(data);

    if (models.length === 0) {
      throw new ComputeProviderError(
        "No valid models returned by compute provider.",
        "invalid-response"
      );
    }

    return models;
  }
}
