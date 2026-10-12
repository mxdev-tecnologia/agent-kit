#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runCheck } from "./commands/check.js";
import { checkSelfReport } from "./commands/check-self.js";
import { runInit } from "./commands/init.js";
import { runSync } from "./commands/sync.js";
import { runUpdate } from "./commands/update.js";
import { readVersion } from "./version.js";

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const USAGE = `Usage: agent-kit <command> [options]

Commands:
  init [--cli claude,codex,antigravity] [--root <dir>] [--dry-run]
                                Install the kit in a project
  update [--force] [--dry-run] [--root <dir>]
                                Bring the project to the installed kit version
  sync [--force] [--dry-run] [--root <dir>]
                                Regenerate the targets from the package and .agents/local/
  check [--root <dir>]          Report drift against agent-kit.lock.json (writes nothing)
  check --self [--root <dir>]   Check the repository invariants

Options:
  -v, --version   Print the version
  -h, --help      Print this help
`;

/** Runs the CLI and returns the exit code (0 ok, 1 check failure, 2 usage error). */
export function main(argv: string[], io: Io): number {
  const usageError = (message: string): number => {
    io.err(`Error: ${message}\n\n${USAGE}`);
    return 2;
  };

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    return usageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;

  if (values.version) {
    io.out(`${readVersion()}\n`);
    return 0;
  }
  if (values.help || positionals.length === 0) {
    io.out(USAGE);
    return 0;
  }

  const [command, ...rest] = positionals;
  const installer = { init: runInit, update: runUpdate, sync: runSync, check: runCheck };
  if (
    rest.length > 0 ||
    !(command === "check" || command === "init" || command === "update" || command === "sync")
  ) {
    return usageError(`unknown command: ${positionals.join(" ")}`);
  }
  if (command !== "check" && values.self) return usageError("--self belongs to check");
  if (command !== "init" && values.cli !== undefined) return usageError("--cli belongs to init");
  if ((command === "init" || command === "check") && values.force) {
    return usageError(`--force does not apply to ${command}`);
  }
  if (command === "check" && values["dry-run"])
    return usageError("--dry-run does not apply to check");
  if (!(command === "check" && values.self)) {
    const args = {
      root: values.root,
      dryRun: values["dry-run"],
      force: values.force,
      cli: values.cli,
    };
    return installer[command](args, io);
  }

  const root = resolve(values.root ?? process.cwd());
  const { failures, catalogFiles } = checkSelfReport(root);
  if (failures.length > 0) {
    io.err(`${failures.map((f) => `FAIL ${f}`).join("\n")}\n`);
    return 1;
  }
  io.out(`OK: repository invariants hold (${root}, ${catalogFiles} catalog files)\n`);
  return 0;
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
      self: { type: "boolean" },
      root: { type: "string" },
      cli: { type: "string" },
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
    },
  });
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = main(process.argv.slice(2), {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
}
