import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Io } from "../cli.js";
import { applyChanges, createOps, InstallError, type Ops } from "../install/apply.js";
import {
  compareVersions,
  LOCK_FILE,
  type Lock,
  loadPackageRegistry,
  readLock,
} from "../install/lock.js";
import { buildPlan, defaultPackageRoot, formatPlan, type Plan } from "../install/plan.js";
import { readVersion } from "../version.js";

/** Injection points for tests; commands use the defaults. */
export interface RunContext {
  packageRoot?: string;
  version?: string;
  env?: NodeJS.ProcessEnv;
  ops?: Ops;
  platform?: string;
}

export interface Resolved {
  packageRoot: string;
  version: string;
  ops: Ops;
}

export function resolveContext(ctx: RunContext): Resolved {
  return {
    packageRoot: ctx.packageRoot ?? defaultPackageRoot(),
    version: ctx.version ?? readVersion(),
    ops: ctx.ops ?? createOps(),
  };
}

/** Real path of the project root, resolved once (RF-06); undefined when it is not a directory. */
export function resolveRoot(root: string | undefined): { root: string } | { error: string } {
  const abs = resolve(root ?? process.cwd());
  try {
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      return { error: `root directory does not exist: ${abs}` };
    }
    return { root: realpathSync(abs) };
  } catch {
    return { error: `root directory does not exist: ${abs}` };
  }
}

/** Prints the plan and, unless it is blocked or a dry run, applies it. Returns the exit code. */
export function finishPlan(plan: Plan, root: string, dryRun: boolean, io: Io, ops: Ops): number {
  if (plan.errors.length > 0) {
    for (const e of plan.errors) io.err(`Error: ${e}\n`);
    io.err("Nothing was written.\n");
    return 1;
  }
  const lines = formatPlan(plan);
  if (lines.length > 0) io.out(`${lines.join("\n")}\n`);
  if (plan.blocking.length > 0) {
    io.err(`${plan.blocking.length} conflict(s); nothing was written (see above).\n`);
    return 1;
  }
  if (dryRun) {
    io.out("Dry run: nothing was written.\n");
    return 0;
  }
  try {
    applyChanges(
      root,
      {
        writes: plan.writes,
        deletes: plan.deletes,
        lock: plan.lockChanged ? { path: LOCK_FILE, data: Buffer.from(plan.lockText) } : undefined,
      },
      ops,
    );
  } catch (error) {
    if (!(error instanceof InstallError)) throw error;
    io.err(`Error: ${error.message}\n`);
    return 1;
  }
  const changed = plan.writes.length + plan.deletes.length + (plan.lockChanged ? 1 : 0);
  io.out(changed === 0 ? "Nothing to do.\n" : "Done.\n");
  return 0;
}

export interface Loaded {
  root: string;
  lock: Lock;
  lockText: string;
  ctx: Resolved;
}

/** Shared start of update, sync and check: root, registry and a validated lock. */
export function loadForRun(
  rootArg: string | undefined,
  context: RunContext,
  io: Io,
): { code: number } | Loaded {
  const r = resolveRoot(rootArg);
  if ("error" in r) {
    io.err(`Error: ${r.error}\n`);
    return { code: 2 };
  }
  const ctx = resolveContext(context);
  try {
    const registry = loadPackageRegistry(ctx.packageRoot);
    const result = readLock(r.root, registry, ctx.ops);
    if (!result.ok) {
      io.err(`Error: ${result.error}\n`);
      return { code: 1 };
    }
    return { root: r.root, lock: result.lock, lockText: result.text, ctx };
  } catch (error) {
    if (!(error instanceof InstallError)) throw error;
    io.err(`Error: ${error.message}\n`);
    return { code: 1 };
  }
}

export interface RunArgs {
  root?: string;
  force?: boolean;
  dryRun?: boolean;
}

export function runUpdate(args: RunArgs, io: Io, context: RunContext = {}): number {
  const loaded = loadForRun(args.root, context, io);
  if ("code" in loaded) return loaded.code;
  const { root, lock, lockText, ctx } = loaded;
  if (compareVersions(ctx.version, lock.version) < 0 && !args.force) {
    io.err(
      `version-downgrade: package ${ctx.version} is older than the lock ${lock.version} (${LOCK_FILE}); use --force to proceed\n`,
    );
    return 1;
  }
  const plan = buildPlan({
    root,
    packageRoot: ctx.packageRoot,
    version: ctx.version,
    clis: lock.clis,
    lock,
    lockText,
    force: args.force === true,
    registry: loadPackageRegistry(ctx.packageRoot),
    ops: ctx.ops,
  });
  return finishPlan(plan, root, args.dryRun === true, io, ctx.ops);
}
