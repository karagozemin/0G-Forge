export type MemoryEntry = {
  key: string;
  value: unknown;
  timestamp: string;
};

export type MemoryStore = {
  entries: MemoryEntry[];
  updatedAt: string;
};

export type MemoryBackend = {
  read(storeKey: string): Promise<MemoryStore | null>;
  write(storeKey: string, store: MemoryStore): Promise<void>;
};

export class MemoryLayer {
  private cache: Map<string, MemoryStore> = new Map();

  constructor(
    private readonly backend: MemoryBackend,
    private readonly storeKey: string
  ) {}

  async load(): Promise<void> {
    const store = await this.backend.read(this.storeKey);
    if (store) {
      this.cache.set(this.storeKey, store);
    }
  }

  async read(key: string): Promise<unknown | undefined> {
    const store = this.cache.get(this.storeKey);
    if (!store) return undefined;

    const entries = store.entries.filter((e) => e.key === key);
    return entries.at(-1)?.value;
  }

  // Replaces all existing entries for the key with a single new entry.
  async write(key: string, value: unknown): Promise<void> {
    const existing = this.cache.get(this.storeKey) ?? {
      entries: [],
      updatedAt: new Date().toISOString()
    };

    existing.entries = existing.entries.filter((e) => e.key !== key);
    existing.entries.push({ key, value, timestamp: new Date().toISOString() });
    existing.updatedAt = new Date().toISOString();

    this.cache.set(this.storeKey, existing);
    await this.backend.write(this.storeKey, existing);
  }

  async append(key: string, value: unknown): Promise<void> {
    const existing = this.cache.get(this.storeKey) ?? {
      entries: [],
      updatedAt: new Date().toISOString()
    };

    existing.entries.push({ key, value, timestamp: new Date().toISOString() });
    existing.updatedAt = new Date().toISOString();

    this.cache.set(this.storeKey, existing);
    await this.backend.write(this.storeKey, existing);
  }

  async readAll(key: string): Promise<unknown[]> {
    const store = this.cache.get(this.storeKey);
    if (!store) return [];
    return store.entries.filter((e) => e.key === key).map((e) => e.value);
  }
}

export function createLocalMemoryBackend(
  filePath: string
): MemoryBackend {
  return {
    async read(storeKey) {
      const { readFile } = await import("node:fs/promises");
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const store = parsed[storeKey];
        if (!store || typeof store !== "object") return null;
        return store as MemoryStore;
      } catch {
        return null;
      }
    },

    async write(storeKey, store) {
      const { readFile, writeFile, mkdir } = await import("node:fs/promises");
      const path = await import("node:path");
      await mkdir(path.dirname(filePath), { recursive: true });

      let existing: Record<string, unknown> = {};
      try {
        const raw = await readFile(filePath, "utf8");
        existing = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // file doesn't exist yet
      }

      existing[storeKey] = store;
      await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    }
  };
}
