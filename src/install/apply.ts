import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { isReservedWindowsName } from "../catalog/collisions.js";

/** Error whose message already names the relative path involved (RNF-06). */
export class InstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallError";
  }
}

export interface Stat {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  mode: number;
}

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

/** File-system access used by every install module; tests inject failures and observe calls. */
export interface Ops {
  /** Returns undefined when the path does not exist. */
  lstat(path: string): Stat | undefined;
  readFile(path: string): Buffer;
  readdir(path: string): DirEntry[];
  /** Exclusive create of a temporary file. */
  writeFile(path: string, data: Buffer, mode: number): void;
  chmod(path: string, mode: number): void;
  rename(from: string, to: string): void;
  unlink(path: string): void;
  rmdir(path: string): void;
  mkdir(path: string): void;
  realpath(path: string): string;
  sleep(ms: number): void;
  /** Counters of the apply layer (files written, files deleted), lock included. */
  stats: { writes: number; deletes: number };
}

export function createOps(over: Partial<Ops> = {}): Ops {
  const base: Ops = {
    lstat: (path) => {
      try {
        const s = lstatSync(path);
        return {
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
          isSymlink: s.isSymbolicLink(),
          mode: s.mode,
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return undefined;
        throw error;
      }
    },
    readFile: (path) => readFileSync(path),
    readdir: (path) =>
      readdirSync(path, { withFileTypes: true }).map((e) => ({
        name: e.name,
        isFile: e.isFile(),
        isDirectory: e.isDirectory(),
        isSymlink: e.isSymbolicLink(),
      })),
    writeFile: (path, data, mode) => writeFileSync(path, data, { flag: "wx", mode }),
    chmod: (path, mode) => chmodSync(path, mode),
    rename: (from, to) => renameSync(from, to),
    unlink: (path) => unlinkSync(path),
    rmdir: (path) => rmdirSync(path),
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    realpath: (path) => realpathSync(path),
    sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
    stats: { writes: 0, deletes: 0 },
  };
  return { ...base, ...over, stats: over.stats ?? base.stats };
}

// --- managed paths and segments ------------------------------------------------------------

const MANAGED_DIR_PREFIXES = [
  ".agents/skills",
  ".agents/agents",
  ".agents/rules",
  ".agents/workflows",
  ".agents/schemas",
  ".claude/skills",
  ".claude/agents",
  ".claude/commands",
];
const MANAGED_FILES = [".agents/providers.json", "AGENTS.md", "CLAUDE.md"];
export const MAX_SEGMENTS = 9;

/** True when the path is one the installer may write or delete (RF-25). */
export function isManagedPath(rel: string): boolean {
  if (MANAGED_FILES.includes(rel)) return true;
  return MANAGED_DIR_PREFIXES.some((p) => rel.startsWith(`${p}/`) && rel.length > p.length + 1);
}

/** Reason a single path segment is not allowed, or undefined (RF-21). */
export function segmentProblem(segment: string): string | undefined {
  if (segment === "" || segment === "." || segment === "..") return `invalid segment "${segment}"`;
  if (!/^\.?[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(segment)) {
    return `segment "${segment}" has characters outside A-Z a-z 0-9 . _ - (or is too long)`;
  }
  if (segment.endsWith(".")) return `segment "${segment}" ends with a dot`;
  if (isReservedWindowsName(segment.replace(/^\./, "x"))) {
    return `segment "${segment}" is a reserved Windows name`;
  }
  return undefined;
}

/** Validates a relative path made of `/`-separated segments; returns the problem or undefined. */
export function relPathProblem(rel: string): string | undefined {
  if (rel === "" || rel.startsWith("/") || /^[A-Za-z]:/.test(rel) || rel.includes("\\")) {
    return "absolute or malformed path";
  }
  const segments = rel.split("/");
  if (segments.length > MAX_SEGMENTS) return "path is too deep";
  for (const s of segments) {
    const p = segmentProblem(s);
    if (p) return p;
  }
  return undefined;
}

/**
 * Absolute destination of a managed relative path, refusing `..`, absolute paths, paths outside
 * the managed set and any symlink below the (already real) root (RF-33).
 */
export function resolveDest(rootReal: string, rel: string, ops: Ops): string {
  const problem = relPathProblem(rel);
  if (problem) throw new InstallError(`${rel}: refused, ${problem}`);
  if (!isManagedPath(rel)) throw new InstallError(`${rel}: refused, not a managed path`);
  const segments = rel.split("/");
  let current = rootReal;
  for (const [i, segment] of segments.entries()) {
    current = join(current, segment);
    const st = ops.lstat(current);
    if (!st) break;
    if (st.isSymlink)
      throw new InstallError(
        `${rel}: refused, symbolic link at ${segments.slice(0, i + 1).join("/")}`,
      );
    const last = i === segments.length - 1;
    if (last && st.isDirectory) throw new InstallError(`${rel}: refused, is a directory`);
    if (!last && !st.isDirectory) {
      throw new InstallError(
        `${rel}: refused, ${segments.slice(0, i + 1).join("/")} is not a directory`,
      );
    }
  }
  return join(rootReal, ...segments);
}

// --- apply ---------------------------------------------------------------------------------

export interface WriteOp {
  path: string;
  data: Buffer;
  exec?: boolean;
}

const RETRIES = 5;
const RETRY_DELAYS_MS = [50, 100, 200, 300];
let tmpCounter = 0;

function atomicWrite(abs: string, rel: string, data: Buffer, exec: boolean, ops: Ops): void {
  ops.stats.writes++;
  ops.mkdir(dirname(abs));
  const tmp = join(dirname(abs), `.agent-kit-${process.pid}-${tmpCounter++}.tmp`);
  const cleanup = () => {
    try {
      if (ops.lstat(tmp)) ops.unlink(tmp);
    } catch {
      // best effort
    }
  };
  try {
    ops.writeFile(tmp, data, exec ? 0o755 : 0o644);
    if (process.platform !== "win32") ops.chmod(tmp, exec ? 0o755 : 0o644);
    for (let attempt = 1; ; attempt++) {
      try {
        ops.rename(tmp, abs);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if ((code === "EPERM" || code === "EBUSY") && attempt < RETRIES) {
          ops.sleep(RETRY_DELAYS_MS[attempt - 1] ?? 300);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    cleanup();
    if (error instanceof InstallError) throw error;
    throw new InstallError(`${rel}: write failed (${(error as Error).message})`);
  }
}

function removeEmptyDirs(rootReal: string, rel: string, ops: Ops): void {
  let dir = dirname(rel);
  while (dir !== "." && MANAGED_DIR_PREFIXES.some((p) => dir === p || dir.startsWith(`${p}/`))) {
    const abs = join(rootReal, ...dir.split("/"));
    try {
      if (ops.readdir(abs).length > 0) return;
      ops.rmdir(abs);
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

/**
 * Applies writes, then deletes, then the lock (last, atomically). Every destination is validated
 * before anything is touched.
 */
export function applyChanges(
  rootReal: string,
  changes: { writes: WriteOp[]; deletes: string[]; lock?: { path: string; data: Buffer } },
  ops: Ops,
): void {
  const writes = changes.writes.map((w) => ({ ...w, abs: resolveDest(rootReal, w.path, ops) }));
  const deletes = changes.deletes.map((p) => ({ path: p, abs: resolveDest(rootReal, p, ops) }));
  for (const w of writes) atomicWrite(w.abs, w.path, w.data, w.exec === true, ops);
  for (const d of deletes) {
    if (!ops.lstat(d.abs)) continue;
    ops.stats.deletes++;
    try {
      ops.unlink(d.abs);
    } catch (error) {
      throw new InstallError(`${d.path}: delete failed (${(error as Error).message})`);
    }
    removeEmptyDirs(rootReal, d.path, ops);
  }
  if (changes.lock) {
    const abs = join(rootReal, changes.lock.path);
    const st = ops.lstat(abs);
    if (st && !st.isFile)
      throw new InstallError(`${changes.lock.path}: refused, not a regular file`);
    atomicWrite(abs, changes.lock.path, changes.lock.data, false, ops);
  }
}
