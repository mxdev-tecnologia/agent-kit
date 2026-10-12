import type { Io } from "../cli.js";
import { InstallError, resolveDest } from "../install/apply.js";
import { hashContent, loadPackageRegistry } from "../install/lock.js";
import { findBlock } from "../install/managed-block.js";
import { buildPlan } from "../install/plan.js";
import { loadForRun, type RunContext } from "./update.js";

export function runCheck(args: { root?: string }, io: Io, context: RunContext = {}): number {
  const loaded = loadForRun(args.root, context, io);
  if ("code" in loaded) return loaded.code;
  const { root, lock, lockText, ctx } = loaded;
  const findings: string[] = [];
  try {
    if (ctx.version !== lock.version) {
      findings.push(
        `version-mismatch: package ${ctx.version} differs from the lock ${lock.version}; run \`agent-kit update\``,
      );
      for (const [path, hash] of Object.entries(lock.files)) {
        const abs = resolveDest(root, path, ctx.ops);
        if (!ctx.ops.lstat(abs)) {
          findings.push(`missing: ${path}`);
          continue;
        }
        let data = ctx.ops.readFile(abs);
        if (path === "AGENTS.md" || path === "CLAUDE.md") {
          const state = findBlock(data.toString("utf8"));
          if (state.kind !== "ok") {
            findings.push(`missing: ${path} (managed block not found)`);
            continue;
          }
          data = Buffer.from(state.content);
        }
        if (hashContent(data) !== hash) findings.push(`edited: ${path}`);
      }
    } else {
      const plan = buildPlan({
        root,
        packageRoot: ctx.packageRoot,
        version: lock.version,
        clis: lock.clis,
        lock,
        lockText,
        force: false,
        registry: loadPackageRegistry(ctx.packageRoot),
        ops: ctx.ops,
      });
      findings.push(...plan.errors);
      for (const e of plan.entries) {
        if (e.action === "create") {
          findings.push(
            e.detail === "missing"
              ? `missing: ${e.path}`
              : `not generated: ${e.path} (run \`agent-kit sync\`)`,
          );
        } else if (e.action === "update") {
          findings.push(`out of date: ${e.path} (run \`agent-kit sync\`)`);
        } else if (e.action === "delete") {
          findings.push(`orphan: ${e.path} (managed file the kit no longer produces)`);
        } else if (e.action === "conflict") {
          findings.push(
            e.detail === "edited"
              ? `edited: ${e.path}`
              : e.detail === "orphan-edited"
                ? `orphan: ${e.path} (edited by hand)`
                : `conflict: ${e.path} (${e.note})`,
          );
        }
      }
    }
  } catch (error) {
    if (!(error instanceof InstallError)) throw error;
    findings.push(error.message);
  }
  if (findings.length > 0) {
    io.err(`${findings.map((f) => `FAIL ${f}`).join("\n")}\n`);
    return 1;
  }
  io.out(`OK: no drift (${root})\n`);
  return 0;
}
