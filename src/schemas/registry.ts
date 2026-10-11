import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Check,
  Compiler,
  run,
  SchemaLoadError,
  type SchemaSource,
  truncate,
  type ValidationResult,
} from "./validate.js";

export const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";
const SUFFIX = ".schema.json";

/** Thrown by {@link loadRegistry}; `errors` has one entry per problem, each naming a file. */
export class RegistryLoadError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "RegistryLoadError";
  }
}

export interface Registry {
  /** Registered `$id`s in load order. */
  readonly ids: readonly string[];
  has(id: string): boolean;
  /** The parsed schema file of an `$id` (read-only). */
  schemaOf(id: string): Readonly<Record<string, unknown>>;
  /** Names of the `$defs` entries of a schema. */
  definitions(id: string): string[];
  /** Validates against `<id>` or `<id>#/$defs/<name>`; throws when the id is unknown. */
  validate(id: string, value: unknown): ValidationResult;
}

/**
 * `$id` a schema file must declare, from its path under the schema directory
 * (`\` and `/` separators are equivalent). Returns `{ error }` when the file name is invalid.
 */
export function expectedSchemaId(relPath: string): { id: string } | { error: string } {
  const path = relPath.replace(/\\/g, "/");
  if (!path.endsWith(SUFFIX)) return { error: `file name must end with ${SUFFIX}` };
  let base = path.slice(0, -SUFFIX.length);
  let major = 1;
  const versioned = /^(.*)\.v(\d+)$/.exec(base);
  if (versioned) {
    const digits = versioned[2] ?? "";
    const n = Number(digits);
    if (n < 2 || digits.startsWith("0")) {
      return { error: `invalid version suffix ".v${digits}" (v1 is implicit; use v2 or later)` };
    }
    major = n;
    base = versioned[1] ?? "";
  }
  if (base === "" || base.split("/").some((part) => part === "")) {
    return { error: "file name has an empty base" };
  }
  return { id: `urn:agent-kit:${base.split("/").join(":")}:v${major}` };
}

function listSchemaFiles(dir: string, rel = ""): string[] {
  const entries = readdirSync(join(dir, rel), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files: string[] = [];
  for (const entry of entries) {
    const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listSchemaFiles(dir, path));
    else if (entry.isFile() && entry.name.endsWith(SUFFIX)) files.push(path);
  }
  return files;
}

/** Loads every `*.schema.json` under `dir` (recursively) and compiles all `$ref`s. */
export function loadRegistry(dir: string): Registry {
  const errors = new Set<string>();
  const sources = new Map<string, SchemaSource>();

  let files: string[];
  try {
    files = listSchemaFiles(dir);
  } catch {
    throw new RegistryLoadError([`${dir}: schema directory cannot be read`]);
  }

  for (const rel of files) {
    const file = join(dir, rel);
    let schema: unknown;
    try {
      schema = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unreadable";
      errors.add(`${file}: invalid JSON: ${truncate(reason)}`);
      continue;
    }
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      errors.add(`${file}: (root): a schema must be an object`);
      continue;
    }
    const root = schema as Record<string, unknown>;
    if (!Object.hasOwn(root, "$schema") || root.$schema !== DRAFT_2020_12) {
      errors.add(`${file}: /$schema: must be "${DRAFT_2020_12}"`);
      continue;
    }
    if (!Object.hasOwn(root, "$id") || typeof root.$id !== "string") {
      errors.add(`${file}: /$id: is required and must be a string`);
      continue;
    }
    const id = root.$id;
    if (sources.has(id)) {
      errors.add(`${file}: /$id: duplicate $id ${truncate(id)}`);
      continue;
    }
    const expected = expectedSchemaId(rel);
    if ("error" in expected) {
      errors.add(`${file}: ${expected.error}`);
      continue;
    }
    if (id !== expected.id) {
      errors.add(`${file}: /$id: must be "${expected.id}" for this path, found ${truncate(id)}`);
      continue;
    }
    sources.set(id, { file, id, schema: root });
  }

  const compiler = new Compiler(sources);
  for (const id of sources.keys()) {
    try {
      compiler.root(id);
    } catch (error) {
      if (!(error instanceof SchemaLoadError)) throw error;
      errors.add(error.message);
    }
  }
  if (errors.size > 0) throw new RegistryLoadError([...errors]);

  const ids = [...sources.keys()];
  const lookup = (id: string): Check => {
    const hash = id.indexOf("#");
    const base = hash === -1 ? id : id.slice(0, hash);
    const source = sources.get(base);
    if (!source) throw new Error(`unknown schema id: ${id}`);
    if (hash === -1) return compiler.root(base);
    const m = /^#\/\$defs\/([^/]+)$/.exec(id.slice(hash));
    const name = m?.[1]?.replace(/~1/g, "/").replace(/~0/g, "~");
    const defs = source.schema.$defs;
    if (
      name === undefined ||
      typeof defs !== "object" ||
      defs === null ||
      !Object.hasOwn(defs, name)
    ) {
      throw new Error(`unknown schema id: ${id}`);
    }
    return compiler.def(base, name);
  };

  return {
    ids,
    has: (id) => sources.has(id),
    schemaOf: (id) => {
      const source = sources.get(id);
      if (!source) throw new Error(`unknown schema id: ${id}`);
      return source.schema;
    },
    definitions: (id) => compiler.defNames(id),
    validate: (id, value) => run(lookup(id), value),
  };
}

/** Validates `value` against a registered schema id (optionally with a `#/$defs/<name>` fragment). */
export function validate(registry: Registry, id: string, value: unknown): ValidationResult {
  return registry.validate(id, value);
}
