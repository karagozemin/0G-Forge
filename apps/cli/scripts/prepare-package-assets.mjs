import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceTemplatesDir = path.resolve(scriptDir, "../../../templates");
const destinationTemplatesDir = path.resolve(scriptDir, "../assets/templates");

const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".pnpm-store"
]);

const EXCLUDED_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock"
]);

function shouldCopy(sourcePath) {
  const relativePath = path.relative(sourceTemplatesDir, sourcePath);
  if (!relativePath || relativePath === ".") {
    return true;
  }

  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const baseName = segments[segments.length - 1];

  if (segments.some((segment) => EXCLUDED_DIR_NAMES.has(segment))) {
    return false;
  }

  if (EXCLUDED_FILE_NAMES.has(baseName)) {
    return false;
  }

  if (baseName.endsWith(".tsbuildinfo")) {
    return false;
  }

  return true;
}

async function ensureSourceTemplatesExist() {
  try {
    await access(path.join(sourceTemplatesDir, "catalog.json"));
  } catch {
    throw new Error(`Template catalog not found at ${sourceTemplatesDir}.`);
  }
}

async function prepareAssets() {
  await ensureSourceTemplatesExist();
  await rm(destinationTemplatesDir, { recursive: true, force: true });
  await mkdir(path.dirname(destinationTemplatesDir), { recursive: true });
  await cp(sourceTemplatesDir, destinationTemplatesDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: shouldCopy
  });
}

await prepareAssets();
