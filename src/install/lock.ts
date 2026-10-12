import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Cli } from "../catalog/collisions.js";
import { loadRegistry, type Registry } from "../schemas/registry.js";
import { InstallError, type Ops } from "./apply.js";

export const LOCK_FILE = "agent-kit.lock.json";
export const LOCK_SCHEMA = "urn:agent-kit:install:lock:v1";

export interface Lock {
  format: "agent-kit-lock/v1";
  version: string;
  clis: Cli[];
  files: Record<string, string>;
}

/** CRLF to LF for text (no NUL byte); binary content is returned untouched. */
export function normalizeEol(data: Buffer): Buffer {
  if (data.includes(0)) return data;
  if (!data.includes(13)) return data;
  return Buffer.from(data.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
}

/** `sha256-<hex>` of the normalized content. */
export function hashContent(data: Buffer): string {
  return `sha256-${createHash("sha256").update(normalizeEol(data)).digest("hex")}`;
}

export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function serializeLock(
  version: string,
  clis: readonly Cli[],
  files: Record<string, string>,
): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(files).sort(cmp)) sorted[key] = files[key] as string;
  const lock = { format: "agent-kit-lock/v1", version, clis: [...clis].sort(cmp), files: sorted };
  return `${JSON.stringify(lock, null, 2)}\n`;
}

export type LockResult = { ok: true; lock: Lock; text: string } | { ok: false; error: string };

/** Reads and validates the lock (untrusted input) against its schema. */
export function readLock(root: string, registry: Registry, ops: Ops): LockResult {
  const abs = join(root, LOCK_FILE);
  let text: string;
  try {
    const st = ops.lstat(abs);
    if (!st) return { ok: false, error: `${LOCK_FILE}: not found (run \`agent-kit init\`)` };
    if (!st.isFile) return { ok: false, error: `${LOCK_FILE}: not a regular file` };
    text = ops.readFile(abs).toString("utf8");
  } catch {
    return { ok: false, error: `${LOCK_FILE}: cannot be read` };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: `${LOCK_FILE}: invalid JSON` };
  }
  if (!registry.has(LOCK_SCHEMA)) {
    return {
      ok: false,
      error: `${LOCK_FILE}: cannot be validated, schema ${LOCK_SCHEMA} is not available`,
    };
  }
  const result = registry.validate(LOCK_SCHEMA, value);
  if (!result.valid) {
    const list = result.errors
      .slice(0, 3)
      .map((e) => `${e.instancePath === "" ? "/" : e.instancePath} ${e.message}`)
      .join("; ");
    return { ok: false, error: `${LOCK_FILE}: invalid lock: ${list}` };
  }
  return { ok: true, lock: value as Lock, text };
}

/** Loads the package schemas registry; throws an InstallError naming the problem. */
export function loadPackageRegistry(packageRoot: string): Registry {
  try {
    return loadRegistry(join(packageRoot, "schemas"));
  } catch (error) {
    throw new InstallError(
      `schemas: cannot be loaded from the package (${(error as Error).message.split("\n")[0]})`,
    );
  }
}

/** Compares semantic versions; negative when a < b. Pre-releases sort before the release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = "", pre] = v.split("+")[0]?.split(/-(.*)/s) ?? [];
    return { nums: core.split(".").map(Number), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === undefined) return 1;
  if (pb.pre === undefined) return -1;
  return cmp(pa.pre, pb.pre);
}
