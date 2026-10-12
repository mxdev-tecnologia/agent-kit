import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, type Registry } from "../schemas/registry.js";
import { validateCommit } from "../validate/commit.js";
import { crossFieldIssues, ENVELOPE_KINDS, type Issue, quote } from "../validate/envelope-rules.js";
import { validateSpec } from "../validate/spec.js";

export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_REPORTED = 50;
export const KINDS = ["spec", "tasks", "verdict", "envelope", "commit"] as const;
type Kind = (typeof KINDS)[number];

/** Wrong usage (exit 2): the caller prints the message together with the usage. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface ValidateIo {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Reads standard input; defaults to file descriptor 0. */
  stdin?: (() => string) | undefined;
}

export interface ValidateOptions {
  positionals: string[];
  json: boolean;
  schemas?: string | undefined;
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Schemas shipped with the package: `schemas/` sits two levels above src/commands and dist/commands. */
function packageSchemas(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schemas");
}

function loadSchemas(dir: string | undefined): Registry {
  try {
    return loadRegistry(dir ?? packageSchemas());
  } catch {
    throw new UsageError(`cannot load the schemas from ${quote(dir ?? "the installed package")}`);
  }
}

function readInput(
  file: string,
  io: ValidateIo,
): { text: string } | { tooLarge: true; bytes: number } {
  if (file === "-") {
    let text: string;
    try {
      text = io.stdin ? io.stdin() : readFileSync(0, "utf8");
    } catch {
      throw new UsageError("cannot read standard input");
    }
    const bytes = Buffer.byteLength(text, "utf8");
    return bytes > MAX_INPUT_BYTES ? { tooLarge: true, bytes } : { text };
  }
  try {
    const bytes = statSync(file).size;
    if (bytes > MAX_INPUT_BYTES) return { tooLarge: true, bytes };
    return { text: readFileSync(file, "utf8") };
  } catch {
    throw new UsageError(`cannot read file: ${quote(file)}`);
  }
}

function pointerKey(path: string): (string | number)[] {
  return path.split("/").map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function comparePointers(a: string, b: string): number {
  const x = pointerKey(a);
  const y = pointerKey(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i] as string | number;
    const q = y[i] as string | number;
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    return String(p) < String(q) ? -1 : 1;
  }
  return x.length - y.length;
}

function lineColumn(text: string, position: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      last = i;
    }
  }
  return { line, column: position - last };
}

function parseJson(text: string): { value: unknown } | { issue: Issue } {
  try {
    return { value: JSON.parse(text.replace(/^﻿/, "")) };
  } catch (error) {
    const found = /position (\d+)/.exec(error instanceof Error ? error.message : "");
    const where = found ? lineColumn(text, Number(found[1])) : undefined;
    return {
      issue: {
        path: "",
        rule: "json-parse",
        message: where
          ? `invalid JSON at line ${where.line}, column ${where.column}`
          : "invalid JSON; fix the syntax",
      },
    };
  }
}

/** Validates a JSON envelope text (kinds `tasks`, `verdict` and `envelope`). */
export function validateJson(
  kind: "tasks" | "verdict" | "envelope",
  text: string,
  schemas: () => Registry,
): Issue[] {
  const parsed = parseJson(text);
  if ("issue" in parsed) return [parsed.issue];
  const { value } = parsed;
  const declared = isObj(value) ? value.schema : undefined;

  let envelopeKind: string;
  if (kind === "envelope") {
    const m = typeof declared === "string" ? /^cortex\.([a-z]+)\/v1$/.exec(declared) : null;
    if (!m || !ENVELOPE_KINDS.includes(m[1] ?? "")) {
      const found = typeof declared === "string" ? `; found "${quote(declared)}"` : "";
      return [
        {
          path: "/schema",
          rule: "unknown-schema",
          message: `schema is missing or not one of the nine cortex.<kind>/v1 envelopes${found}`,
        },
      ];
    }
    envelopeKind = m[1] as string;
  } else {
    envelopeKind = kind === "tasks" ? "plan" : "verdict";
    const expected = `cortex.${envelopeKind}/v1`;
    if (typeof declared === "string" && declared !== expected) {
      return [
        {
          path: "/schema",
          rule: "wrong-kind",
          message: `expected "${expected}" for validate ${kind}; found "${quote(declared)}"`,
        },
      ];
    }
  }

  const registry = schemas();
  const id = `urn:agent-kit:cortex:${envelopeKind}:v1`;
  if (!registry.has(id)) throw new UsageError(`the schemas folder has no ${id}`);
  const result = registry.validate(id, value);
  const issues: Issue[] = result.valid
    ? []
    : result.errors.map((e) => ({
        path: e.instancePath,
        rule: "schema",
        message: `${e.keyword}: ${e.message}`,
      }));
  issues.push(...crossFieldIssues(envelopeKind, value));
  return issues
    .map((issue, order) => ({ issue, order }))
    .sort((a, b) => comparePointers(a.issue.path, b.issue.path) || a.order - b.order)
    .map(({ issue }) => issue);
}

/** Runs `agent-kit validate`; returns the exit code (0 valid, 1 invalid) or throws {@link UsageError}. */
export function runValidate(options: ValidateOptions, io: ValidateIo): number {
  const [kindArg, file, ...extra] = options.positionals;
  if (kindArg === undefined) throw new UsageError("validate requires <kind> and <file|->");
  if (!(KINDS as readonly string[]).includes(kindArg)) {
    throw new UsageError(`unknown kind: ${quote(kindArg)} (use ${KINDS.join(", ")})`);
  }
  if (file === undefined) throw new UsageError("validate requires <file|->");
  if (extra.length > 0) throw new UsageError("validate takes only one <file|->");
  const kind = kindArg as Kind;

  const name = file === "-" ? "<stdin>" : file;
  const input = readInput(file, io);
  let issues: Issue[];
  if ("tooLarge" in input) {
    issues = [
      {
        path: kind === "spec" || kind === "commit" ? `${name}:1` : "",
        rule: "too-large",
        message: `input has ${input.bytes} bytes, over the limit of ${MAX_INPUT_BYTES} bytes; it was not parsed`,
      },
    ];
  } else if (kind === "spec") {
    issues = validateSpec(input.text, name);
  } else if (kind === "commit") {
    issues = validateCommit(input.text, name);
  } else {
    let registry: Registry | undefined;
    issues = validateJson(kind, input.text, () => {
      registry ??= loadSchemas(options.schemas);
      return registry;
    });
  }

  const errors = issues.slice(0, MAX_REPORTED);
  const valid = issues.length === 0;
  if (options.json) {
    io.out(
      `${JSON.stringify({
        valid,
        errors: errors.map((e) => ({ path: e.path, rule: e.rule, message: e.message })),
      })}\n`,
    );
  } else if (valid) {
    io.out(`OK: ${kind} valid (${name})\n`);
  } else {
    io.err(`${errors.map((e) => `${e.path}: ${e.rule}: ${e.message}`).join("\n")}\n`);
  }
  return valid ? 0 : 1;
}
