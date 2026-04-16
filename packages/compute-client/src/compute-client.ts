import crypto from "node:crypto";
import { maskToken, type StoredAuth } from "./auth-store.js";

export const DEFAULT_COMPUTE_ENDPOINT = "mock://local";

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

const MOCK_MODELS: ComputeModel[] = [
  { id: "0g-large", name: "0G Large", contextWindow: 128000 },
  { id: "0g-medium", name: "0G Medium", contextWindow: 64000 },
  { id: "0g-fast", name: "0G Fast", contextWindow: 16000 }
];

type ComputeClientOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

function isHttpEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("http://") || endpoint.startsWith("https://");
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
        contextWindow: typeof record.contextWindow === "number" ? record.contextWindow : undefined
      });

      return accumulator;
    }, []);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return parseRemoteModels(record.models);
  }

  return [];
}

export class ComputeClient {
  private endpoint?: string;
  private fetchImpl: typeof fetch;

  constructor(options: ComputeClientOptions = {}) {
    this.endpoint = options.endpoint;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private resolveEndpoint(auth: StoredAuth): string {
    return auth.endpoint || this.endpoint || DEFAULT_COMPUTE_ENDPOINT;
  }

  async validateAuthState(auth: StoredAuth): Promise<ComputeIdentity> {
    if (!auth.token.trim()) {
      throw new Error("Missing auth token. Please run `og login`.");
    }

    const endpoint = this.resolveEndpoint(auth);

    if (!isHttpEndpoint(endpoint)) {
      return {
        accountId: auth.accountId ?? deriveLocalAccountId(auth.token),
        endpoint,
        tokenPreview: maskToken(auth.token),
        validationMode: "local"
      };
    }

    const response = await this.fetchImpl(`${endpoint}/v1/whoami`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Auth validation failed with status ${response.status}.`);
    }

    const data = (await response.json()) as unknown;

    return {
      accountId: parseRemoteAccountId(data) ?? auth.accountId ?? "unknown",
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

    const response = await this.fetchImpl(`${identity.endpoint}/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Model listing failed with status ${response.status}.`);
    }

    const data = (await response.json()) as unknown;
    const models = parseRemoteModels(data);

    if (models.length === 0) {
      throw new Error("No models returned by Compute API.");
    }

    return models;
  }
}
