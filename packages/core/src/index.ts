export const name = "@og/core";

export {
	HISTORY_FILE_NAME,
	MANIFEST_FILE_NAME,
	OG_DIR_NAME,
	appendHistoryLine,
	createManifest,
	ensureHistoryFile,
	getHistoryPath,
	getManifestPath,
	getOgDirPath,
	isOgProject,
	manifestSchema,
	readManifest,
	updateManifest,
	validateManifest
} from "./project-state";

export type { CreateManifestInput, ManifestPatch, OgManifest } from "./project-state";
