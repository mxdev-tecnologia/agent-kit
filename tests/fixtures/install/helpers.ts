import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Io } from "../../../src/cli.js";
import type { RunContext } from "../../../src/commands/update.js";

export const REPO = join(import.meta.dirname, "..", "..", "..");
const tmp: string[] = [];

export function cleanup(): void {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
}

export function tempDir(prefix = "agent-kit-t-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmp.push(d);
  return d;
}

export function put(root: string, rel: string, content: string | Buffer, mode?: number): string {
  const path = join(root, ...rel.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  if (mode !== undefined) chmodSync(path, mode);
  return path;
}

export const read = (root: string, rel: string): string =>
  readFileSync(join(root, ...rel.split("/")), "utf8");
export const exists = (root: string, rel: string): boolean =>
  existsSync(join(root, ...rel.split("/")));

const BASE = (name: string, description: string) =>
  `format: agent-kit/v1\nname: ${name}\ndescription: ${description}`;

export const skillMd = (name: string, body = "Skill body.\n") =>
  `---\n${BASE(name, `Skill ${name}.`)}\n---\n${body}`;
export const workflowMd = (name: string, hint?: string) =>
  `---\n${BASE(name, `Workflow ${name}.`)}${hint ? `\nargument-hint: ${JSON.stringify(hint)}` : ""}\n---\nRun the ${name} workflow.\n`;
export const agentMd = (name: string, caps: string[]) =>
  `---\n${BASE(name, `Agent ${name}.`)}\ntitle: Title ${name}\ncapabilities: [${caps.join(", ")}]\ntier: fast\n---\nYou are ${name}.\n`;
export const ruleMd = (name: string, extra = "always: true", body = `Rule ${name} body.\n`) =>
  `---\n${BASE(name, `Rule ${name}.`)}\n${extra}\n---\n${body}`;

export interface PackageOptions {
  providers?: boolean;
  version?: string;
}

/** A package root: the repository schemas plus a small fixture catalog. */
export function makePackage(opts: PackageOptions = {}): string {
  const pkg = tempDir("agent-kit-pkg-");
  cpSync(join(REPO, "schemas"), join(pkg, "schemas"), { recursive: true });
  put(pkg, "catalog/skills/planning/SKILL.md", skillMd("planning"));
  put(pkg, "catalog/skills/planning/references/guide.md", "Guide.\n");
  put(pkg, "catalog/skills/planning/scripts/run.sh", "#!/bin/sh\necho hi\n", 0o755);
  put(pkg, "catalog/workflows/ship.md", workflowMd("ship", "[scope]"));
  put(pkg, "catalog/agents/reviewer.md", agentMd("reviewer", ["read", "search"]));
  put(pkg, "catalog/rules/style.md", ruleMd("style"));
  put(
    pkg,
    "catalog/rules/ts-style.md",
    ruleMd("ts-style", 'always: false\napplies-to: ["src/**/*.ts"]', "Scoped body.\n"),
  );
  if (opts.providers) put(pkg, "catalog/providers.json", '{"a":1}\n');
  return pkg;
}

export function makeProject(): string {
  return tempDir("agent-kit-proj-");
}

export interface Result {
  code: number;
  out: string;
  err: string;
}

export function capture(fn: (io: Io) => number): Result {
  let out = "";
  let err = "";
  const code = fn({ out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

export const ctxFor = (pkg: string, extra: Partial<RunContext> = {}): RunContext => ({
  packageRoot: pkg,
  version: "1.0.0",
  env: { PATH: "" },
  ...extra,
});

export interface SnapEntry {
  kind: "dir" | "file" | "link";
  data?: string;
  mtime: number;
  mode?: number;
}

/** Paths, bytes and mtimes of a tree. */
export function snapshot(root: string, rel = ""): Record<string, SnapEntry> {
  const out: Record<string, SnapEntry> = {};
  const dir = rel === "" ? root : join(root, rel);
  for (const name of readdirSync(dir).sort()) {
    const r = rel === "" ? name : `${rel}/${name}`;
    const st = lstatSync(join(root, r));
    if (st.isSymbolicLink()) out[r] = { kind: "link", mtime: st.mtimeMs };
    else if (st.isDirectory()) {
      out[r] = { kind: "dir", mtime: st.mtimeMs };
      Object.assign(out, snapshot(root, r));
    } else {
      out[r] = {
        kind: "file",
        data: readFileSync(join(root, r)).toString("base64"),
        mtime: st.mtimeMs,
        mode: st.mode,
      };
    }
  }
  return out;
}

export function listFiles(root: string, rel = ""): string[] {
  return Object.entries(snapshot(root, rel))
    .filter(([, e]) => e.kind === "file")
    .map(([p]) => p);
}

import { runCheck } from "../../../src/commands/check.js";
import { runInit } from "../../../src/commands/init.js";
import { runSync } from "../../../src/commands/sync.js";
import { runUpdate } from "../../../src/commands/update.js";

export const ALL = "claude,codex,antigravity";
export const doInit = (
  root: string,
  pkg: string,
  args: { cli?: string; dryRun?: boolean } = { cli: ALL },
  ctx: Partial<RunContext> = {},
) => capture((io) => runInit({ root, ...args }, io, ctxFor(pkg, ctx)));
export const doUpdate = (
  root: string,
  pkg: string,
  args: { force?: boolean; dryRun?: boolean } = {},
  ctx: Partial<RunContext> = {},
) => capture((io) => runUpdate({ root, ...args }, io, ctxFor(pkg, ctx)));
export const doSync = (
  root: string,
  pkg: string,
  args: { force?: boolean; dryRun?: boolean } = {},
  ctx: Partial<RunContext> = {},
) => capture((io) => runSync({ root, ...args }, io, ctxFor(pkg, ctx)));
export const doCheck = (root: string, pkg: string, ctx: Partial<RunContext> = {}) =>
  capture((io) => runCheck({ root }, io, ctxFor(pkg, ctx)));

/** Installs the fixture kit with all three CLIs and returns the project root. */
export function installed(pkg: string, cli = ALL): string {
  const root = makeProject();
  const r = doInit(root, pkg, { cli });
  if (r.code !== 0) throw new Error(`init failed: ${r.err}`);
  return root;
}

export const localRule = (name: string) =>
  `---\nformat: agent-kit/v1\nname: ${name}\ndescription: Local ${name}.\n---\nLocal body ${name}.\n`;
