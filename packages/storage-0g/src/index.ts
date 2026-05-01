import { ethers } from "ethers";
import {
  type SyncPayload,
  type SyncProvider,
  type SyncProviderInfo,
  validateSyncPayload
} from "@og/storage";

export const ZEROG_SYNC_PROVIDER_NAME = "0g-storage";

const FRAMEWORK_REGISTRY_ABI = [
  "function setSyncHash(string calldata projectKey, string calldata fileHash) external",
  "function getSyncHash(string calldata projectKey) external view returns (string)"
] as const;

export type ZeroGSyncProviderOptions = {
  indexerRpc: string;
  evmRpc: string;
  privateKey: string;
  contractAddress: string;
};

function resolveOptions(): ZeroGSyncProviderOptions {
  const indexerRpc = process.env.OG_STORAGE_INDEXER_RPC?.trim();
  const evmRpc = process.env.OG_EVM_RPC?.trim() || "https://evmrpc-testnet.0g.ai"; // 0G Galileo Testnet (chainId 16602)
  const privateKey = process.env.OG_PRIVATE_KEY?.trim();
  const contractAddress = process.env.OG_REGISTRY_CONTRACT?.trim();

  if (!indexerRpc) {
    throw new Error("OG_STORAGE_INDEXER_RPC is required for 0G Storage sync provider.");
  }
  if (!privateKey) {
    throw new Error("OG_PRIVATE_KEY is required for 0G Storage sync provider.");
  }
  if (!contractAddress) {
    throw new Error("OG_REGISTRY_CONTRACT is required for 0G Storage sync provider.");
  }

  return { indexerRpc, evmRpc, privateKey, contractAddress };
}

async function uploadToZeroG(
  payload: SyncPayload,
  options: ZeroGSyncProviderOptions
): Promise<string> {
  const { Indexer, MemData } = await import("@0glabs/0g-ts-sdk");

  const provider = new ethers.JsonRpcProvider(options.evmRpc);
  const signer = new ethers.Wallet(options.privateKey, provider);

  const raw = Buffer.from(JSON.stringify(payload), "utf8");
  const memData = new MemData(raw);

  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Failed to compute 0G Storage merkle tree: ${treeErr.message}`);
  }

  const fileHash = tree.rootHash();

  const indexer = new Indexer(options.indexerRpc);
  const [, uploadErr] = await indexer.upload(memData, 0, signer);
  if (uploadErr !== null) {
    throw new Error(`Failed to upload to 0G Storage: ${uploadErr.message}`);
  }

  return fileHash;
}

async function downloadFromZeroG(
  fileHash: string,
  options: ZeroGSyncProviderOptions
): Promise<SyncPayload> {
  const { Indexer } = await import("@0glabs/0g-ts-sdk");

  const indexer = new Indexer(options.indexerRpc);
  const [data, err] = await indexer.download(fileHash, options.indexerRpc, true);
  if (err !== null) {
    throw new Error(`Failed to download from 0G Storage: ${err.message}`);
  }

  const raw = Buffer.from(data as Uint8Array).toString("utf8");
  return validateSyncPayload(JSON.parse(raw) as unknown);
}

async function storeHashOnChain(
  projectKey: string,
  fileHash: string,
  options: ZeroGSyncProviderOptions
): Promise<void> {
  const provider = new ethers.JsonRpcProvider(options.evmRpc);
  const signer = new ethers.Wallet(options.privateKey, provider);
  const contract = new ethers.Contract(options.contractAddress, FRAMEWORK_REGISTRY_ABI, signer);
  const tx = await (contract.setSyncHash as (k: string, h: string) => Promise<ethers.ContractTransactionResponse>)(projectKey, fileHash);
  await tx.wait();
}

async function readHashFromChain(
  projectKey: string,
  options: ZeroGSyncProviderOptions
): Promise<string | null> {
  const provider = new ethers.JsonRpcProvider(options.evmRpc);
  const contract = new ethers.Contract(options.contractAddress, FRAMEWORK_REGISTRY_ABI, provider);
  const hash = await (contract.getSyncHash as (k: string) => Promise<string>)(projectKey);
  return hash && hash.length > 0 ? hash : null;
}

class ZeroGStorageSyncProvider implements SyncProvider {
  constructor(private readonly options: ZeroGSyncProviderOptions) {}

  getInfo(): SyncProviderInfo {
    return {
      name: ZEROG_SYNC_PROVIDER_NAME,
      storagePath: `0g://${this.options.indexerRpc}`
    };
  }

  async push(projectKey: string, payload: SyncPayload): Promise<void> {
    const fileHash = await uploadToZeroG(payload, this.options);
    await storeHashOnChain(projectKey, fileHash, this.options);
  }

  async pull(projectKey: string): Promise<SyncPayload | null> {
    const fileHash = await readHashFromChain(projectKey, this.options);
    if (!fileHash) {
      return null;
    }

    return downloadFromZeroG(fileHash, this.options);
  }
}

export function createZeroGSyncProvider(
  options?: ZeroGSyncProviderOptions
): SyncProvider {
  return new ZeroGStorageSyncProvider(options ?? resolveOptions());
}
