import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceTemplatesDir = path.resolve(scriptDir, "../../../templates");
const destinationTemplatesDir = path.resolve(scriptDir, "../assets/templates");

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
    errorOnExist: false
  });
}

await prepareAssets();
