import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../schemas/frontmatter.js";
import { loadRegistry, type Registry, RegistryLoadError } from "../schemas/registry.js";
import { truncate } from "../schemas/validate.js";

const REQUIRED_FILES = [
  "README.md",
  "LICENSE",
  "AGENTS.md",
  "CLAUDE.md",
  "VERSION",
  "CHANGELOG.md",
  "package.json",
];

const REQUIRED_DIRS = [
  "catalog/agents",
  "catalog/skills",
  "catalog/workflows",
  "catalog/rules",
  "schemas",
];

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

type CatalogType = "agent" | "skill" | "workflow" | "rule";

interface CatalogFile {
  type: CatalogType;
  /** Path shown in messages, always with `/`. */
  display: string;
  /** Absolute path, or undefined for a skill folder without SKILL.md. */
  path?: string;
  /** Name the frontmatter must declare (file name without `.md`, or the skill folder). */
  expectedName: string;
}

const CATALOG_DIRS: [CatalogType, string][] = [
  ["agent", "agents"],
  ["workflow", "workflows"],
  ["rule", "rules"],
];

function entries(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  } catch {
    return [];
  }
}

function listCatalog(root: string): CatalogFile[] {
  const files: CatalogFile[] = [];
  for (const [type, folder] of CATALOG_DIRS) {
    for (const entry of entries(join(root, "catalog", folder))) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      files.push({
        type,
        display: `catalog/${folder}/${entry.name}`,
        path: join(root, "catalog", folder, entry.name),
        expectedName: entry.name.slice(0, -".md".length),
      });
    }
  }
  for (const entry of entries(join(root, "catalog", "skills"))) {
    if (!entry.isDirectory()) continue;
    const skill = join(root, "catalog", "skills", entry.name, "SKILL.md");
    files.push({
      type: "skill",
      display: `catalog/skills/${entry.name}/SKILL.md`,
      path: existsSync(skill) && statSync(skill).isFile() ? skill : undefined,
      expectedName: entry.name,
    });
  }
  return files;
}

function loadSchemas(root: string, failures: string[]): Registry | undefined {
  // A missing schemas directory is already reported as a missing directory.
  if (!isDir(join(root, "schemas"))) return undefined;
  try {
    return loadRegistry(join(root, "schemas"));
  } catch (error) {
    if (error instanceof RegistryLoadError) {
      for (const message of error.errors) failures.push(`schema: ${message}`);
    } else {
      failures.push("schema: the schemas directory cannot be loaded");
    }
    return undefined;
  }
}

/** Validates the catalog frontmatter against the repository schemas (fail closed). */
function checkCatalog(root: string, failures: string[]): number {
  const registry = loadSchemas(root, failures);
  const files = listCatalog(root);
  const names = new Map<string, string>();

  for (const file of files) {
    if (!file.path) {
      failures.push(`${file.display}: skill folder has no SKILL.md`);
      continue;
    }
    const schemaId = `urn:agent-kit:frontmatter:${file.type}:v1`;
    if (!registry?.has(schemaId)) {
      failures.push(`${file.display}: cannot be validated, schema ${schemaId} is not available`);
      continue;
    }
    let text: string;
    try {
      text = readFileSync(file.path, "utf8");
    } catch {
      failures.push(`${file.display}: file cannot be read`);
      continue;
    }
    const parsed = parseFrontmatter(text);
    if (!parsed.ok) {
      failures.push(`${file.display}: ${parsed.error}`);
      continue;
    }
    const result = registry.validate(schemaId, parsed.data);
    if (!result.valid) {
      const list = result.errors
        .map((e) => `${e.instancePath === "" ? "/" : e.instancePath} ${e.message} [${e.keyword}]`)
        .join("; ");
      failures.push(`${file.display}: invalid ${file.type} frontmatter: ${list}`);
    }
    const name = parsed.data.name;
    if (typeof name !== "string") continue;
    if (name !== file.expectedName) {
      failures.push(`${file.display}: name "${truncate(name)}" must equal "${file.expectedName}"`);
    }
    if (file.type === "skill" || file.type === "workflow") {
      const other = names.get(name);
      if (other) {
        failures.push(
          `${file.display}: name "${truncate(name)}" is also used by ${other} (skills and workflows share one namespace)`,
        );
      } else {
        names.set(name, file.display);
      }
    }
  }
  return files.length;
}

export interface SelfCheckReport {
  failures: string[];
  /** Catalog files (and skill folders) examined. */
  catalogFiles: number;
}

/** Returns one message per violated repository invariant (empty when all hold). */
export function checkSelf(root: string): string[] {
  return checkSelfReport(root).failures;
}

export function checkSelfReport(root: string): SelfCheckReport {
  const failures: string[] = [];

  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(root, file))) failures.push(`missing file: ${file}`);
  }
  for (const dir of REQUIRED_DIRS) {
    if (!isDir(join(root, ...dir.split("/")))) failures.push(`missing directory: ${dir}`);
  }

  const versionPath = join(root, "VERSION");
  const pkgPath = join(root, "package.json");
  if (existsSync(versionPath) && existsSync(pkgPath)) {
    try {
      const fileVersion = readFileSync(versionPath, "utf8").trim();
      const pkgVersion = (JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string })
        .version;
      if (fileVersion !== pkgVersion) {
        failures.push(
          `VERSION mismatch: VERSION is "${fileVersion}" but package.json is "${pkgVersion}"`,
        );
      }
    } catch {
      failures.push("package.json: unreadable or invalid JSON");
    }
  }

  const catalogFiles = checkCatalog(root, failures);
  return { failures, catalogFiles };
}
