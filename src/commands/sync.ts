import type { Io } from "../cli.js";
import { loadPackageRegistry } from "../install/lock.js";
import { buildPlan } from "../install/plan.js";
import { finishPlan, loadForRun, type RunArgs, type RunContext } from "./update.js";

export function runSync(args: RunArgs, io: Io, context: RunContext = {}): number {
  const loaded = loadForRun(args.root, context, io);
  if ("code" in loaded) return loaded.code;
  const { root, lock, lockText, ctx } = loaded;
  if (ctx.version !== lock.version) {
    io.err(
      `version-mismatch: package ${ctx.version} differs from the lock ${lock.version}; run \`agent-kit update\`\n`,
    );
    return 1;
  }
  const plan = buildPlan({
    root,
    packageRoot: ctx.packageRoot,
    version: lock.version,
    clis: lock.clis,
    lock,
    lockText,
    force: args.force === true,
    registry: loadPackageRegistry(ctx.packageRoot),
    ops: ctx.ops,
  });
  return finishPlan(plan, root, args.dryRun === true, io, ctx.ops);
}
