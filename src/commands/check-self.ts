import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

/** Returns one message per violated repository invariant (empty when all hold). */
export function checkSelf(root: string): string[] {
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

  return failures;
}
