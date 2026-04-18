import { existsSync } from "node:fs";
import { access, cp, readFile } from "node:fs/promises";
import path from "node:path";

export const SUPPORTED_TEMPLATE_IDS = ["react-vite", "nextjs-app", "static-landing"] as const;
export type SupportedTemplateId = (typeof SUPPORTED_TEMPLATE_IDS)[number];

export const DEFAULT_TEMPLATE_ID: SupportedTemplateId = "react-vite";

type TemplateCatalogEntry = {
  id: string;
  path: string;
  description: string;
};

type TemplateCatalog = {
  templates: TemplateCatalogEntry[];
};

export type ResolvedTemplate = {
  id: SupportedTemplateId;
  description: string;
  templatePath: string;
};

type CatalogLocation = {
  catalogPath: string;
  rootPath: string;
};

function getCandidateCatalogPaths(): string[] {
  const candidates: string[] = [];
  const runtimeDir =
    typeof __dirname === "string" && __dirname.length > 0
      ? path.resolve(__dirname)
      : process.argv[1]
        ? path.dirname(path.resolve(process.argv[1]))
        : process.cwd();

  candidates.push(path.resolve(runtimeDir, "../assets/templates/catalog.json"));
  candidates.push(path.resolve(runtimeDir, "../templates/catalog.json"));
  candidates.push(path.resolve(runtimeDir, "templates/catalog.json"));
  candidates.push(path.resolve(runtimeDir, "../../../templates/catalog.json"));

  if (typeof __dirname === "string" && __dirname.length > 0) {
    candidates.push(path.resolve(__dirname, "../assets/templates/catalog.json"));
    candidates.push(path.resolve(__dirname, "../templates/catalog.json"));
    candidates.push(path.resolve(__dirname, "templates/catalog.json"));
    candidates.push(path.resolve(__dirname, "../../../templates/catalog.json"));
  }

  const entryScriptPath = process.argv[1];
  if (entryScriptPath) {
    const entryDir = path.dirname(path.resolve(entryScriptPath));
    candidates.push(path.resolve(entryDir, "../assets/templates/catalog.json"));
    candidates.push(path.resolve(entryDir, "../templates/catalog.json"));
    candidates.push(path.resolve(entryDir, "templates/catalog.json"));
    candidates.push(path.resolve(entryDir, "../../../templates/catalog.json"));
  }

  candidates.push(path.resolve(process.cwd(), "templates/catalog.json"));

  return candidates;
}

function resolveCatalogLocation(): CatalogLocation {
  const checked = new Set<string>();
  for (const candidatePath of getCandidateCatalogPaths()) {
    const resolvedPath = path.resolve(candidatePath);
    if (checked.has(resolvedPath)) {
      continue;
    }

    checked.add(resolvedPath);

    if (existsSync(resolvedPath)) {
      return {
        catalogPath: resolvedPath,
        rootPath: path.resolve(path.dirname(resolvedPath), "..")
      };
    }
  }

  throw new Error(
    "Could not locate template catalog. If using an installed package, reinstall or run `pnpm --filter @og/cli run prepare:assets` before packaging."
  );
}

function isSupportedTemplateId(value: string): value is SupportedTemplateId {
  return SUPPORTED_TEMPLATE_IDS.includes(value as SupportedTemplateId);
}

async function readCatalog(): Promise<TemplateCatalog> {
  const { catalogPath } = resolveCatalogLocation();
  const raw = await readFile(catalogPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Template catalog format is invalid.");
  }

  const catalog = parsed as TemplateCatalog;

  if (!Array.isArray(catalog.templates)) {
    throw new Error("Template catalog is missing templates array.");
  }

  return catalog;
}

export async function resolveTemplate(templateId: string): Promise<ResolvedTemplate> {
  if (!isSupportedTemplateId(templateId)) {
    throw new Error(
      `Unsupported template '${templateId}'. Supported templates: ${SUPPORTED_TEMPLATE_IDS.join(", ")}.`
    );
  }

  const catalog = await readCatalog();
  const entry = catalog.templates.find((item) => item.id === templateId);

  if (!entry) {
    throw new Error(`Template '${templateId}' not found in catalog.`);
  }

  const { rootPath } = resolveCatalogLocation();
  const templatePath = path.resolve(rootPath, entry.path);

  try {
    await access(templatePath);
  } catch {
    throw new Error(`Template path does not exist: ${templatePath}`);
  }

  return {
    id: templateId,
    description: entry.description,
    templatePath
  };
}

export async function copyTemplateToDirectory(
  templateId: SupportedTemplateId,
  targetDir: string
): Promise<ResolvedTemplate> {
  const template = await resolveTemplate(templateId);
  await cp(template.templatePath, targetDir, {
    recursive: true,
    force: true,
    errorOnExist: false
  });
  return template;
}
