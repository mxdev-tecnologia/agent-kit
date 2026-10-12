import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Cli, nameCollisions } from "../catalog/collisions.js";
import { parseFrontmatter } from "../schemas/frontmatter.js";
import type { Registry } from "../schemas/registry.js";
import { type DirEntry, InstallError, type Ops, resolveDest, type WriteOp } from "./apply.js";
import { cmp, hashContent, type Lock, normalizeEol, serializeLock } from "./lock.js";
import { applyBlock, findBlock } from "./managed-block.js";
import { type Asset, buildDesired, type Item, type ItemType, type SharedFile } from "./targets.js";

/** Package root, resolved from this module (`src/install` or `dist/install`). */
export function defaultPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export type Action = "create" | "update" | "delete" | "unchanged" | "conflict";

export interface PlanEntry {
  action: Action;
  path: string;
  /** What kind of conflict or why. */
  note?: string;
  /** Conflict that `--force` overrides (and did). */
  overridden?: boolean;
  /** Kind used by `check`. */
  detail?: "edited" | "unmanaged" | "orphan-edited" | "orphan" | "missing" | "new" | "stale";
}

export interface Plan {
  entries: PlanEntry[];
  writes: WriteOp[];
  deletes: string[];
  lockText: string;
  lockChanged: boolean;
  /** Problems that stop the run (invalid items, collisions, unsafe paths). */
  errors: string[];
  /** Conflicts that are not overridden. */
  blocking: string[];
}

export interface PlanInput {
  root: string;
  packageRoot: string;
  version: string;
  clis: Cli[];
  lock?: Lock;
  lockText?: string;
  force: boolean;
  registry: Registry;
  ops: Ops;
}

const SECRET = [/^\.env/i, /\.pem$/i, /\.key$/i, /^id_/i, /^service_account.*\.json$/i];
const isSecret = (name: string) => SECRET.some((re) => re.test(name));
const FOLDERS: [ItemType, string][] = [
  ["skill", "skills"],
  ["agent", "agents"],
  ["workflow", "workflows"],
  ["rule", "rules"],
];

const sortedEntries = (ops: Ops, dir: string): DirEntry[] =>
  ops.readdir(dir).sort((a, b) => cmp(a.name, b.name));

function readText(ops: Ops, abs: string): string {
  return normalizeEol(ops.readFile(abs)).toString("utf8");
}

// --- sources -------------------------------------------------------------------------------

function collectAssets(
  ops: Ops,
  dir: string,
  rel: string,
  display: string,
  origin: "kit" | "local",
  errors: string[],
  out: Asset[],
): void {
  if (!ops.lstat(dir)?.isDirectory) return;
  for (const e of sortedEntries(ops, dir)) {
    const childRel = `${rel}/${e.name}`;
    if (e.isSymlink) {
      if (origin === "kit") errors.push(`${display}/${childRel}: symbolic links are not allowed`);
      continue;
    }
    if (origin === "local" && isSecret(e.name)) continue; // reported by the local scan
    const abs = join(dir, e.name);
    if (e.isDirectory) {
      collectAssets(ops, abs, childRel, display, origin, errors, out);
    } else if (e.isFile) {
      const st = ops.lstat(abs);
      const exec = process.platform !== "win32" && ((st?.mode ?? 0) & 0o111) !== 0;
      out.push({
        rel: childRel,
        data: normalizeEol(ops.readFile(abs)),
        exec: exec && childRel.startsWith("scripts/"),
      });
    }
  }
}

function loadItems(
  base: string,
  displayBase: string,
  origin: "kit" | "local",
  registry: Registry,
  ops: Ops,
  errors: string[],
): Item[] {
  const items: Item[] = [];
  const addItem = (
    type: ItemType,
    expected: string,
    abs: string,
    display: string,
    dir?: string,
  ) => {
    let raw: string;
    try {
      raw = readText(ops, abs);
    } catch {
      errors.push(`${display}: file cannot be read`);
      return;
    }
    const parsed = parseFrontmatter(raw);
    if (!parsed.ok) {
      errors.push(`${display}: ${parsed.error}`);
      return;
    }
    const schemaId = `urn:agent-kit:frontmatter:${type}:v1`;
    if (!registry.has(schemaId)) {
      errors.push(`${display}: cannot be validated, schema ${schemaId} is not available`);
      return;
    }
    const result = registry.validate(schemaId, parsed.data);
    if (!result.valid) {
      const list = result.errors
        .map((e) => `${e.instancePath === "" ? "/" : e.instancePath} ${e.message} [${e.keyword}]`)
        .join("; ");
      errors.push(`${display}: invalid ${type} frontmatter: ${list}`);
      return;
    }
    if (parsed.data.name !== expected) {
      errors.push(`${display}: name "${String(parsed.data.name)}" must equal "${expected}"`);
      return;
    }
    const assets: Asset[] = [];
    if (dir !== undefined) {
      const dirDisplay = display.slice(0, -"/SKILL.md".length);
      for (const sub of ["references", "scripts"]) {
        collectAssets(ops, join(dir, sub), sub, dirDisplay, origin, errors, assets);
      }
    }
    items.push({
      type,
      name: expected,
      data: parsed.data,
      raw,
      body: parsed.body,
      assets,
      origin,
      source: display,
    });
  };

  for (const [type, folder] of FOLDERS) {
    const dir = join(base, folder);
    const st = ops.lstat(dir);
    if (!st) continue;
    if (!st.isDirectory) {
      errors.push(`${displayBase}/${folder}: not a directory`);
      continue;
    }
    for (const e of sortedEntries(ops, dir)) {
      const display = `${displayBase}/${folder}/${e.name}`;
      if (e.isSymlink) {
        if (origin === "kit") errors.push(`${display}: symbolic links are not allowed`);
        continue;
      }
      if (origin === "local" && isSecret(e.name)) continue;
      if (type === "skill") {
        if (e.isDirectory) {
          const skill = join(dir, e.name, "SKILL.md");
          const sst = ops.lstat(skill);
          if (!sst?.isFile) {
            errors.push(`${display}/SKILL.md: skill folder has no SKILL.md`);
            continue;
          }
          addItem("skill", e.name, skill, `${display}/SKILL.md`, join(dir, e.name));
        } else if (e.name.endsWith(".md")) {
          errors.push(`${display}: loose file in skills (a skill is <name>/SKILL.md)`);
        }
      } else if (e.isFile && e.name.endsWith(".md")) {
        addItem(type, e.name.slice(0, -3), join(dir, e.name), display);
      }
    }
  }
  return items;
}

/** Refuses symlinks and secret files anywhere under `.agents/local/` (RF-17); never reads them. */
function scanLocal(dir: string, display: string, ops: Ops, errors: string[]): void {
  const st = ops.lstat(dir);
  if (!st) return;
  if (st.isSymlink) {
    errors.push(`${display}: symbolic links are not allowed`);
    return;
  }
  if (!st.isDirectory) return;
  for (const e of sortedEntries(ops, dir)) {
    const path = `${display}/${e.name}`;
    if (e.isSymlink) errors.push(`${path}: symbolic links are not allowed`);
    else if (isSecret(e.name)) errors.push(`${path}: secret files are not allowed`);
    else if (e.isDirectory) scanLocal(join(dir, e.name), path, ops, errors);
  }
}

function collectSchemas(dir: string, rel: string, ops: Ops, out: SharedFile[]): void {
  if (!ops.lstat(dir)?.isDirectory) return;
  for (const e of sortedEntries(ops, dir)) {
    const childRel = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory) collectSchemas(join(dir, e.name), childRel, ops, out);
    else if (e.isFile && e.name.endsWith(".json")) {
      out.push({ rel: childRel, data: normalizeEol(ops.readFile(join(dir, e.name))) });
    }
  }
}

const namespace = (t: ItemType) => (t === "skill" || t === "workflow" ? "command" : t);

// --- plan ----------------------------------------------------------------------------------

export function buildPlan(input: PlanInput): Plan {
  const { root, packageRoot, lock, force, registry, ops } = input;
  const errors: string[] = [];
  const entries: PlanEntry[] = [];
  const writes: WriteOp[] = [];
  const deletes: string[] = [];
  const blocking: string[] = [];
  const files: Record<string, string> = {};

  const kit = loadItems(join(packageRoot, "catalog"), "catalog", "kit", registry, ops, errors);
  scanLocal(join(root, ".agents", "local"), ".agents/local", ops, errors);
  const local = loadItems(
    join(root, ".agents", "local"),
    ".agents/local",
    "local",
    registry,
    ops,
    errors,
  );

  const items: Item[] = [];
  const taken = new Map<string, Item>();
  for (const item of kit) {
    items.push(item);
    taken.set(`${namespace(item.type)}:${item.name}`, item);
  }
  for (const item of kit) {
    for (const msg of nameCollisions(item.name, input.clis)) errors.push(`${item.source}: ${msg}`);
  }
  for (const item of local) {
    const problems = nameCollisions(item.name, input.clis);
    const other = taken.get(`${namespace(item.type)}:${item.name}`);
    if (other) {
      problems.push(
        other.origin === "kit"
          ? `name "${item.name}" is already used by the kit item ${other.source} and cannot be overridden`
          : `name "${item.name}" is also used by ${other.source}`,
      );
    }
    for (const msg of problems) errors.push(`${item.source}: ${msg}`);
    if (problems.length === 0) {
      items.push(item);
      taken.set(`${namespace(item.type)}:${item.name}`, item);
    }
  }

  const shared: SharedFile[] = [];
  collectSchemas(join(packageRoot, "schemas"), "", ops, shared);
  let providers: Buffer | undefined;
  const providersPath = join(packageRoot, "catalog", "providers.json");
  if (ops.lstat(providersPath)?.isFile) providers = normalizeEol(ops.readFile(providersPath));

  let desired: ReturnType<typeof buildDesired> = [];
  try {
    desired = buildDesired(items, input.clis, shared, providers);
  } catch (error) {
    if (!(error instanceof InstallError)) throw error;
    errors.push(...error.message.split("\n"));
  }

  const desiredPaths = new Set(desired.map((d) => d.path));
  const conflict = (
    path: string,
    note: string,
    forceable: boolean,
    detail: PlanEntry["detail"],
  ) => {
    const overridden = forceable && force;
    entries.push({ action: "conflict", path, note, overridden, detail });
    if (!overridden) blocking.push(`${path}: ${note}`);
    return overridden;
  };

  for (const d of desired) {
    let abs: string;
    try {
      abs = resolveDest(root, d.path, ops);
    } catch (error) {
      errors.push((error as Error).message);
      continue;
    }
    const inLock = lock?.files[d.path];
    const st = ops.lstat(abs);
    const desiredHash = hashContent(d.data);
    const tryRead = (): Buffer | undefined => {
      try {
        return ops.readFile(abs);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "unreadable";
        errors.push(`${d.path}: cannot be read (${code})`);
        return undefined;
      }
    };

    if (d.block) {
      let existing: string | undefined;
      if (st) {
        const bytes = tryRead();
        if (!bytes) continue;
        try {
          existing = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        } catch {
          existing = undefined;
        }
        if (existing === undefined || !Buffer.from(existing, "utf8").equals(bytes)) {
          errors.push(`${d.path}: refused, the file is not valid UTF-8`);
          continue;
        }
      }
      const state = existing === undefined ? { kind: "none" as const } : findBlock(existing);
      if (state.kind === "malformed") {
        errors.push(`${d.path}: malformed agent-kit markers (${state.reason})`);
        continue;
      }
      const write = () => {
        writes.push({
          path: d.path,
          data: Buffer.from(applyBlock(existing, d.data.toString("utf8"))),
        });
        files[d.path] = desiredHash;
      };
      if (state.kind === "none") {
        entries.push({ action: "create", path: d.path, detail: inLock ? "missing" : "new" });
        write();
        continue;
      }
      const diskHash = hashContent(Buffer.from(state.content));
      if (diskHash === desiredHash) {
        entries.push({ action: "unchanged", path: d.path });
        files[d.path] = desiredHash;
      } else if (inLock !== undefined && diskHash === inLock) {
        entries.push({ action: "update", path: d.path, detail: "stale" });
        write();
      } else if (inLock !== undefined) {
        if (conflict(d.path, "edited by hand", true, "edited")) write();
      } else {
        conflict(d.path, "exists, is not managed by agent-kit and differs", false, "unmanaged");
      }
      continue;
    }

    const exec = d.exec === true;
    if (!st) {
      entries.push({ action: "create", path: d.path, detail: inLock ? "missing" : "new" });
      writes.push({ path: d.path, data: d.data, exec });
      files[d.path] = desiredHash;
      continue;
    }
    const bytes = tryRead();
    if (!bytes) continue;
    const diskHash = hashContent(bytes);
    if (diskHash === desiredHash) {
      entries.push({ action: "unchanged", path: d.path });
      files[d.path] = desiredHash;
    } else if (inLock !== undefined && diskHash === inLock) {
      entries.push({ action: "update", path: d.path, detail: "stale" });
      writes.push({ path: d.path, data: d.data, exec });
      files[d.path] = desiredHash;
    } else if (inLock !== undefined) {
      if (conflict(d.path, "edited by hand", true, "edited")) {
        writes.push({ path: d.path, data: d.data, exec });
        files[d.path] = desiredHash;
      }
    } else {
      conflict(d.path, "exists, is not managed by agent-kit and differs", false, "unmanaged");
    }
  }

  // Lock entries the new version no longer produces.
  if (lock) {
    for (const path of Object.keys(lock.files).sort(cmp)) {
      if (desiredPaths.has(path)) continue;
      let abs: string;
      try {
        abs = resolveDest(root, path, ops);
      } catch (error) {
        errors.push((error as Error).message);
        continue;
      }
      const st = ops.lstat(abs);
      if (!st || path === "AGENTS.md" || path === "CLAUDE.md") continue; // entry dropped
      let bytes: Buffer;
      try {
        bytes = ops.readFile(abs);
      } catch (error) {
        errors.push(
          `${path}: cannot be read (${(error as NodeJS.ErrnoException).code ?? "unreadable"})`,
        );
        continue;
      }
      const diskHash = hashContent(bytes);
      if (diskHash === lock.files[path]) {
        entries.push({ action: "delete", path, detail: "orphan" });
        deletes.push(path);
      } else {
        conflict(path, "removed by the kit but edited by hand", true, "orphan-edited");
        // with --force the entry is dropped and the file stays on disk
      }
    }
  }

  const clis = input.clis;
  const lockText = serializeLock(input.version, clis, files);
  const lockChanged =
    input.lockText === undefined ||
    normalizeEol(Buffer.from(input.lockText)).toString("utf8") !== lockText;
  entries.sort((a, b) => cmp(a.path, b.path));
  return { entries, writes, deletes, lockText, lockChanged, errors, blocking };
}

export function formatPlan(plan: Plan): string[] {
  return plan.entries.map((e) => {
    const forced =
      e.detail === "orphan-edited" ? "; entry dropped, file kept" : "; overwritten by --force";
    const note = e.note ? ` (${e.note}${e.overridden ? forced : ""})` : "";
    return `${e.action.padEnd(9)} ${e.path}${note}`;
  });
}
