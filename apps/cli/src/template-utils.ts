import { access, cp, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function getWorkspaceRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../..");
}

function getCatalogPath(): string {
  return path.join(getWorkspaceRoot(), "templates", "catalog.json");
}

function isSupportedTemplateId(value: string): value is SupportedTemplateId {
  return SUPPORTED_TEMPLATE_IDS.includes(value as SupportedTemplateId);
}

async function readCatalog(): Promise<TemplateCatalog> {
  const catalogPath = getCatalogPath();
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

  const templatePath = path.resolve(getWorkspaceRoot(), entry.path);

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
