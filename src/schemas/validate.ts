import { FORMATS } from "./formats.js";

/** Validator for the JSON Schema 2020-12 subset declared in ADR-0002. Fail closed on anything else. */

export const MAX_ERRORS = 50;
export const MAX_QUOTED = 80;

export interface ValidationError {
  instancePath: string;
  keyword: string;
  message: string;
}

export type ValidationResult = { valid: true } | { valid: false; errors: ValidationError[] };

/** A schema that cannot be loaded. The message always names the file and the keyword pointer. */
export class SchemaLoadError extends Error {
  constructor(
    readonly file: string,
    readonly pointer: string,
    reason: string,
  ) {
    super(`${file}: ${pointer === "" ? "(root)" : pointer}: ${reason}`);
    this.name = "SchemaLoadError";
  }
}

export interface Errors {
  list: ValidationError[];
  max: number;
}

export type Check = (value: unknown, path: string, errs: Errors) => void;

export interface SchemaSource {
  file: string;
  id: string;
  schema: Record<string, unknown>;
}

const KEYWORDS = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "title",
  "description",
  "examples",
  "default",
  "type",
  "const",
  "enum",
  "properties",
  "patternProperties",
  "additionalProperties",
  "required",
  "maxProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "oneOf",
  "anyOf",
]);
const ROOT_ONLY = new Set(["$schema", "$id", "$defs"]);
const TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

/** Shortens text to at most 80 code points, ending with an ellipsis when cut. */
export function truncate(text: string): string {
  if (text.length <= MAX_QUOTED) return text;
  const points = Array.from(text);
  if (points.length <= MAX_QUOTED) return text;
  return `${points.slice(0, MAX_QUOTED - 1).join("")}…`;
}

export function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function segment(name: string): string {
  return escapePointer(truncate(name));
}

function show(value: unknown): string {
  if (typeof value === "string") return truncate(JSON.stringify(value));
  if (Array.isArray(value)) return "an array";
  if (value !== null && typeof value === "object") return "an object";
  return String(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(node: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(node, key) ? node[key] : undefined;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return false;
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
    );
  }
  return false;
}

function push(errs: Errors, path: string, keyword: string, message: string): void {
  if (errs.list.length < errs.max) errs.list.push({ instancePath: path, keyword, message });
}

function matches(check: Check, value: unknown): boolean {
  const scratch: Errors = { list: [], max: 1 };
  check(value, "", scratch);
  return scratch.list.length === 0;
}

/** True when the pattern source has `*`, `+` or `{n,}` outside a character class. */
export function hasUnboundedQuantifier(source: string): boolean {
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      i++;
    } else if (inClass) {
      if (ch === "]") inClass = false;
    } else if (ch === "[") {
      inClass = true;
    } else if (ch === "*" || ch === "+") {
      return true;
    } else if (ch === "{" && /^\{\d+,\}/.test(source.slice(i))) {
      return true;
    }
  }
  return false;
}

/** Compiles the schemas of a registry; every problem is a {@link SchemaLoadError}. */
export class Compiler {
  private readonly memo = new Map<string, Check | SchemaLoadError>();
  private readonly inProgress = new Set<string>();

  constructor(private readonly sources: ReadonlyMap<string, SchemaSource>) {}

  /** Compiled root of a schema (also compiles all of its `$defs`). */
  root(id: string): Check {
    return this.target(id, undefined);
  }

  /** Compiled `#/$defs/<name>` of a schema. */
  def(id: string, name: string): Check {
    return this.target(id, name);
  }

  defNames(id: string): string[] {
    const defs = this.sources.get(id)?.schema.$defs;
    return isObject(defs) ? Object.keys(defs) : [];
  }

  private target(id: string, defName: string | undefined): Check {
    const key = defName === undefined ? id : `${id}#/$defs/${defName}`;
    const cached = this.memo.get(key);
    if (cached instanceof SchemaLoadError) throw cached;
    if (cached) return cached;
    const source = this.sources.get(id);
    if (!source) throw new Error(`unknown schema id: ${id}`);
    this.inProgress.add(key);
    try {
      let check: Check;
      if (defName === undefined) {
        check = this.compileNode(source, source.schema, "", true);
      } else {
        const defs = own(source.schema, "$defs");
        check = this.compileNode(
          source,
          isObject(defs) ? own(defs, defName) : undefined,
          `/$defs/${escapePointer(defName)}`,
          false,
        );
      }
      this.memo.set(key, check);
      this.inProgress.delete(key);
      if (defName === undefined) this.compileDefs(source);
      return check;
    } catch (error) {
      if (error instanceof SchemaLoadError && !this.memo.has(key)) this.memo.set(key, error);
      throw error;
    } finally {
      this.inProgress.delete(key);
    }
  }

  /** Compiles the `$defs` of a schema after its root is done, so a def may refer to the root. */
  private compileDefs(source: SchemaSource): void {
    const defs = own(source.schema, "$defs");
    if (isObject(defs)) {
      for (const name of Object.keys(defs)) this.def(source.id, name);
    }
  }

  private resolveRef(source: SchemaSource, ref: string, pointer: string): Check {
    const fail = (reason: string): never => {
      throw new SchemaLoadError(source.file, pointer, reason);
    };
    const shown = truncate(ref);
    if (/^(https?|file):/i.test(ref)) return fail(`remote $ref is not allowed: ${shown}`);
    const hash = ref.indexOf("#");
    const base = hash === -1 ? ref : ref.slice(0, hash);
    const fragment = hash === -1 ? undefined : ref.slice(hash + 1);
    let id = source.id;
    if (base !== "") {
      if (!this.sources.has(base)) {
        return fail(
          base.startsWith("urn:")
            ? `unresolved $ref: ${shown}`
            : `remote or relative $ref is not allowed: ${shown}`,
        );
      }
      id = base;
    } else if (fragment === undefined || fragment === "") {
      return fail(`$ref must point to #/$defs/<name> or to a registered $id: ${shown}`);
    }
    let defName: string | undefined;
    if (fragment !== undefined) {
      const m = /^\/\$defs\/([^/]+)$/.exec(fragment);
      if (!m?.[1]) return fail(`$ref fragment must be #/$defs/<name>: ${shown}`);
      defName = m[1].replace(/~1/g, "/").replace(/~0/g, "~");
      const defs = own(this.sources.get(id)?.schema ?? {}, "$defs");
      if (!isObject(defs) || !Object.hasOwn(defs, defName)) {
        return fail(`unresolved $ref: ${shown}`);
      }
    }
    const key = defName === undefined ? id : `${id}#/$defs/${defName}`;
    if (this.inProgress.has(key)) return fail(`$ref cycle through ${shown}`);
    return this.target(id, defName);
  }

  private compileNode(
    source: SchemaSource,
    node: unknown,
    pointer: string,
    isRoot: boolean,
  ): Check {
    const { file } = source;
    const fail = (reason: string, at = pointer): never => {
      throw new SchemaLoadError(file, at, reason);
    };
    if (!isObject(node)) return fail("a schema must be an object");
    const kw = (name: string) => `${pointer}/${escapePointer(name)}`;
    const bad = (name: string, reason: string): never => fail(reason, kw(name));

    for (const key of Object.keys(node)) {
      if (!KEYWORDS.has(key)) bad(key, `unsupported keyword "${truncate(key)}"`);
      if (ROOT_ONLY.has(key) && !isRoot) bad(key, `"${key}" is allowed only at the root`);
    }

    const checks: Check[] = [];
    const get = (name: string) => own(node, name);
    const has = (name: string) => Object.hasOwn(node, name);

    for (const name of ["title", "description"]) {
      if (has(name) && typeof get(name) !== "string") bad(name, `${name} must be a string`);
    }
    if (has("examples") && !Array.isArray(get("examples"))) bad("examples", "must be an array");
    for (const name of ["$schema", "$id"]) {
      if (has(name) && typeof get(name) !== "string") bad(name, `${name} must be a string`);
    }
    if (has("$defs") && !isObject(get("$defs"))) bad("$defs", "must be an object of schemas");

    if (has("$ref")) {
      const ref = get("$ref");
      if (typeof ref !== "string") bad("$ref", "must be a string");
      const target = this.resolveRef(source, ref as string, kw("$ref"));
      checks.push(target);
    }

    if (has("type")) {
      const raw = get("type");
      const list = typeof raw === "string" ? [raw] : raw;
      if (
        !Array.isArray(list) ||
        list.length === 0 ||
        new Set(list).size !== list.length ||
        !list.every((t) => typeof t === "string" && TYPES.has(t))
      ) {
        bad("type", "must be a type name or a non-empty list of unique type names");
      }
      const types = list as string[];
      checks.push((v, path, errs) => {
        if (!types.some((t) => typeMatches(t, v))) {
          push(errs, path, "type", `must be ${types.join(" or ")}`);
        }
      });
    }

    if (has("const")) {
      const expected = get("const");
      checks.push((v, path, errs) => {
        if (!deepEqual(v, expected)) {
          push(errs, path, "const", `${show(v)} is not the allowed constant value`);
        }
      });
    }

    if (has("enum")) {
      const values = get("enum");
      if (!Array.isArray(values) || values.length === 0) bad("enum", "must be a non-empty array");
      const allowed = values as unknown[];
      checks.push((v, path, errs) => {
        if (!allowed.some((item) => deepEqual(v, item))) {
          push(errs, path, "enum", `${show(v)} is not one of the allowed values`);
        }
      });
    }

    // Object keywords.
    const propertyChecks = new Map<string, Check>();
    const patternChecks: [RegExp, Check][] = [];
    if (has("properties")) {
      const props = get("properties");
      if (!isObject(props)) bad("properties", "must be an object of schemas");
      for (const name of Object.keys(props as Record<string, unknown>)) {
        propertyChecks.set(
          name,
          this.compileNode(
            source,
            own(props as Record<string, unknown>, name),
            `${kw("properties")}/${escapePointer(name)}`,
            false,
          ),
        );
      }
    }
    let additional: Check | boolean | undefined;
    if (has("additionalProperties")) {
      const ap = get("additionalProperties");
      additional =
        typeof ap === "boolean"
          ? ap
          : this.compileNode(source, ap, kw("additionalProperties"), false);
    }
    if (has("patternProperties")) {
      const pp = get("patternProperties");
      if (!isObject(pp)) bad("patternProperties", "must be an object of schemas");
      for (const key of Object.keys(pp as Record<string, unknown>)) {
        const at = `${kw("patternProperties")}/${escapePointer(key)}`;
        let re: RegExp;
        try {
          re = new RegExp(key, "u");
        } catch {
          return fail("patternProperties key is not a valid pattern", at);
        }
        if (additional !== false && hasUnboundedQuantifier(key)) {
          return fail(
            "patternProperties key must be bounded unless additionalProperties is false",
            at,
          );
        }
        patternChecks.push([
          re,
          this.compileNode(source, own(pp as Record<string, unknown>, key), at, false),
        ]);
      }
    }
    let required: string[] | undefined;
    if (has("required")) {
      const r = get("required");
      if (
        !Array.isArray(r) ||
        !r.every((n) => typeof n === "string") ||
        new Set(r).size !== r.length
      ) {
        bad("required", "must be an array of unique strings");
      }
      required = r as string[];
    }
    let maxProperties: number | undefined;
    if (has("maxProperties")) {
      const m = get("maxProperties");
      if (!nonNegativeInteger(m)) bad("maxProperties", "must be a non-negative integer");
      maxProperties = m as number;
    }
    if (
      required !== undefined ||
      maxProperties !== undefined ||
      propertyChecks.size > 0 ||
      patternChecks.length > 0 ||
      additional !== undefined
    ) {
      const addl = additional;
      checks.push((v, path, errs) => {
        if (!isObject(v)) return;
        for (const name of required ?? []) {
          if (!Object.hasOwn(v, name)) {
            push(errs, path, "required", `missing required property "${truncate(name)}"`);
          }
        }
        const keys = Object.keys(v);
        if (maxProperties !== undefined && keys.length > maxProperties) {
          push(errs, path, "maxProperties", `must have at most ${maxProperties} properties`);
        }
        for (const key of keys) {
          let known = false;
          const child = propertyChecks.get(key);
          if (child) {
            known = true;
            child(v[key], `${path}/${segment(key)}`, errs);
          }
          for (const [re, check] of patternChecks) {
            if (re.test(key)) {
              known = true;
              check(v[key], `${path}/${segment(key)}`, errs);
            }
          }
          if (known || addl === undefined || addl === true) continue;
          if (addl === false) {
            push(errs, path, "additionalProperties", `unexpected property "${truncate(key)}"`);
          } else {
            addl(v[key], `${path}/${segment(key)}`, errs);
          }
        }
      });
    }

    // Array keywords.
    let minItems: number | undefined;
    let maxItems: number | undefined;
    for (const name of ["minItems", "maxItems"]) {
      if (has(name)) {
        const n = get(name);
        if (!nonNegativeInteger(n)) bad(name, "must be a non-negative integer");
        if (name === "minItems") minItems = n as number;
        else maxItems = n as number;
      }
    }
    let unique = false;
    if (has("uniqueItems")) {
      if (typeof get("uniqueItems") !== "boolean") bad("uniqueItems", "must be a boolean");
      unique = get("uniqueItems") === true;
    }
    const itemsCheck = has("items")
      ? this.compileNode(source, get("items"), kw("items"), false)
      : undefined;
    if (minItems !== undefined || maxItems !== undefined || unique || itemsCheck) {
      checks.push((v, path, errs) => {
        if (!Array.isArray(v)) return;
        if (minItems !== undefined && v.length < minItems) {
          push(errs, path, "minItems", `must have at least ${minItems} items`);
        }
        if (maxItems !== undefined && v.length > maxItems) {
          push(errs, path, "maxItems", `must have at most ${maxItems} items`);
        }
        if (unique) {
          let duplicate = false;
          for (let i = 1; i < v.length && !duplicate; i++) {
            for (let j = 0; j < i; j++) {
              if (deepEqual(v[i], v[j])) {
                duplicate = true;
                break;
              }
            }
          }
          if (duplicate) push(errs, path, "uniqueItems", "must not contain duplicate items");
        }
        if (itemsCheck) {
          for (let i = 0; i < v.length; i++) itemsCheck(v[i], `${path}/${i}`, errs);
        }
      });
    }

    // String keywords.
    let minLength: number | undefined;
    let maxLength: number | undefined;
    for (const name of ["minLength", "maxLength"]) {
      if (has(name)) {
        const n = get(name);
        if (!nonNegativeInteger(n)) bad(name, "must be a non-negative integer");
        if (name === "minLength") minLength = n as number;
        else maxLength = n as number;
      }
    }
    let pattern: RegExp | undefined;
    if (has("pattern")) {
      const p = get("pattern");
      if (typeof p !== "string") bad("pattern", "must be a string");
      try {
        pattern = new RegExp(p as string, "u");
      } catch {
        bad("pattern", "is not a valid regular expression");
      }
      if (maxLength === undefined) bad("pattern", "requires a maxLength in the same schema");
    }
    let format: ((value: string) => boolean) | undefined;
    let formatName = "";
    if (has("format")) {
      const f = get("format");
      format = typeof f === "string" ? FORMATS.get(f) : undefined;
      if (!format) bad("format", "unsupported format (only date-time and uuid)");
      formatName = f as string;
    }
    if (
      minLength !== undefined ||
      maxLength !== undefined ||
      pattern !== undefined ||
      format !== undefined
    ) {
      checks.push((v, path, errs) => {
        if (typeof v !== "string") return;
        if (minLength !== undefined && v.length < 2 * minLength && codePoints(v) < minLength) {
          push(errs, path, "minLength", `must have at least ${minLength} characters`);
        }
        if (maxLength !== undefined && v.length > maxLength && codePoints(v) > maxLength) {
          push(errs, path, "maxLength", `must have at most ${maxLength} characters`);
          return;
        }
        if (pattern && !pattern.test(v)) {
          push(errs, path, "pattern", `${show(v)} does not match the required pattern`);
        }
        if (format && !format(v)) {
          push(errs, path, "format", `${show(v)} is not a valid ${formatName}`);
        }
      });
    }

    // Number keywords.
    let minimum: number | undefined;
    let maximum: number | undefined;
    for (const name of ["minimum", "maximum"]) {
      if (has(name)) {
        const n = get(name);
        if (typeof n !== "number" || !Number.isFinite(n)) bad(name, "must be a finite number");
        if (name === "minimum") minimum = n as number;
        else maximum = n as number;
      }
    }
    if (minimum !== undefined || maximum !== undefined) {
      checks.push((v, path, errs) => {
        if (typeof v !== "number") return;
        if (minimum !== undefined && v < minimum) {
          push(errs, path, "minimum", `must be >= ${minimum}`);
        }
        if (maximum !== undefined && v > maximum) {
          push(errs, path, "maximum", `must be <= ${maximum}`);
        }
      });
    }

    // Combinators.
    for (const name of ["oneOf", "anyOf"] as const) {
      if (!has(name)) continue;
      const list = get(name);
      if (!Array.isArray(list) || list.length === 0) bad(name, "must be a non-empty array");
      const branches = (list as unknown[]).map((item, i) =>
        this.compileNode(source, item, `${kw(name)}/${i}`, false),
      );
      checks.push((v, path, errs) => {
        const count = branches.filter((b) => matches(b, v)).length;
        if (name === "oneOf" && count !== 1) {
          push(errs, path, "oneOf", `must match exactly one schema (matched ${count})`);
        } else if (name === "anyOf" && count === 0) {
          push(errs, path, "anyOf", "must match at least one schema");
        }
      });
    }

    return (v, path, errs) => {
      for (const check of checks) check(v, path, errs);
    };
  }
}

/** Runs a compiled check and builds the public result (at most 50 errors). */
export function run(check: Check, value: unknown): ValidationResult {
  const errs: Errors = { list: [], max: MAX_ERRORS };
  check(value, "", errs);
  return errs.list.length === 0 ? { valid: true } : { valid: false, errors: errs.list };
}
