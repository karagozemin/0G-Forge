export const name = "@og/compute-client";

export {
	APP_CONFIG_DIR_NAME,
	AUTH_FILE_NAME,
	clearAuth,
	getAuthFilePath,
	getUserConfigDir,
	maskToken,
	readAuth,
	saveAuth
} from "./auth-store.js";

export {
	DEFAULT_COMPUTE_ENDPOINT,
	MOCK_COMPUTE_ENDPOINT,
	ComputeClient,
	ComputeProviderError,
	type ComputeIdentity,
	type ComputeModel
} from "./compute-client.js";

export type { StoredAuth } from "./auth-store.js";
