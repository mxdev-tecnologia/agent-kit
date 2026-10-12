import { join } from "node:path";
import { CLIS, type Cli } from "../catalog/collisions.js";
import type { Io } from "../cli.js";
import { InstallError } from "../install/apply.js";
import { detectClis, parseCliList } from "../install/detect.js";
import { LOCK_FILE, loadPackageRegistry } from "../install/lock.js";
import { buildPlan } from "../install/plan.js";
import { finishPlan, type RunContext, resolveContext, resolveRoot } from "./update.js";

export interface InitArgs {
  root?: string;
  cli?: string;
  dryRun?: boolean;
}

export function runInit(args: InitArgs, io: Io, context: RunContext = {}): number {
  const r = resolveRoot(args.root);
  if ("error" in r) {
    io.err(`Error: ${r.error}\n`);
    return 2;
  }
  const ctx = resolveContext(context);
  const options = `valid options: --cli ${CLIS.join(",")}`;

  let clis: Cli[];
  if (args.cli !== undefined) {
    const parsed = parseCliList(args.cli);
    if ("error" in parsed) {
      io.err(`Error: ${parsed.error}\n`);
      return 2;
    }
    clis = parsed.clis;
  } else {
    clis = detectClis(r.root, context.env ?? process.env, ctx.ops, context.platform);
    if (clis.length === 0) {
      io.err(`Error: no supported CLI detected; pass --cli (${options})\n`);
      return 2;
    }
    io.out(`Detected CLIs: ${clis.join(", ")}\n`);
  }

  if (ctx.ops.lstat(join(r.root, LOCK_FILE))) {
    io.err(`Error: ${LOCK_FILE}: already exists; run \`agent-kit update\` instead\n`);
    return 1;
  }
  try {
    const plan = buildPlan({
      root: r.root,
      packageRoot: ctx.packageRoot,
      version: ctx.version,
      clis,
      force: false,
      registry: loadPackageRegistry(ctx.packageRoot),
      ops: ctx.ops,
    });
    return finishPlan(plan, r.root, args.dryRun === true, io, ctx.ops);
  } catch (error) {
    if (!(error instanceof InstallError)) throw error;
    io.err(`Error: ${error.message}\n`);
    return 1;
  }
}
