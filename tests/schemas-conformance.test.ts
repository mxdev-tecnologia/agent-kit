import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { afterEach, describe, expect, it } from "vitest";
import { isDateTime, isUuid } from "../src/schemas/formats.js";
import { loadRegistry, type Registry } from "../src/schemas/registry.js";

const REPO_SCHEMAS = join(import.meta.dirname, "..", "schemas");
const REPO_FIXTURES = join(import.meta.dirname, "fixtures", "schemas");
const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$defs",
  "title",
  "description",
  "examples",
  "default",
]);

type AjvLike = {
  addSchema(schema: unknown): unknown;
  addFormat(name: string, format: unknown): unknown;
  getSchema(ref: string): ((value: unknown) => boolean) | undefined;
};
const AjvClass = ((Ajv2020 as unknown as { default?: unknown }).default ?? Ajv2020) as new (
  options: Record<string, unknown>,
) => AjvLike;

function makeOracle(registry: Registry): AjvLike {
  const ajv = new AjvClass({ strict: true, allowUnionTypes: true });
  ajv.addFormat("date-time", { type: "string", validate: isDateTime });
  ajv.addFormat("uuid", { type: "string", validate: isUuid });
  for (const id of registry.ids) ajv.addSchema(registry.schemaOf(id));
  return ajv;
}

/** Fixture folder of a schema id: `urn:agent-kit:a:b:v1` -> `a-b`, `...:v2` -> `a-b-v2`. */
function fixtureFolder(id: string): string {
  const m = /^urn:agent-kit:(.+):v(\d+)$/.exec(id);
  if (!m) throw new Error(`unexpected id ${id}`);
  const major = Number(m[2]);
  return `${(m[1] ?? "").replace(/:/g, "-")}${major >= 2 ? `-v${major}` : ""}`;
}

interface Target {
  ref: string;
  dir: string;
}

function jsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "cases.json")
      .sort();
  } catch {
    return [];
  }
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/**
 * Conformance harness (RF-25): discovers every schema (or `$defs` entry of a definitions-only
 * schema) and its fixtures, and compares the own validator, the cases and the ajv oracle.
 */
function checkConformance(
  schemasDir: string,
  fixturesDir: string,
  options: { oracle?: boolean } = {},
): { failures: string[]; checked: string[] } {
  const failures: string[] = [];
  const checked: string[] = [];
  let registry: Registry;
  try {
    registry = loadRegistry(schemasDir);
  } catch (error) {
    return { failures: [`registry: ${(error as Error).message}`], checked };
  }
  const oracle = options.oracle === false ? undefined : makeOracle(registry);

  const targets: Target[] = [];
  const knownDirs = new Map<string, Set<string>>();
  for (const id of registry.ids) {
    const folder = fixtureFolder(id);
    const schema = registry.schemaOf(id);
    const rooted = Object.keys(schema).some((k) => !ANNOTATIONS.has(k));
    if (rooted) {
      targets.push({ ref: id, dir: join(fixturesDir, folder) });
      knownDirs.set(folder, new Set(["valid", "invalid"]));
    } else {
      const defs = registry.definitions(id);
      for (const def of defs) {
        targets.push({ ref: `${id}#/$defs/${def}`, dir: join(fixturesDir, folder, def) });
      }
      knownDirs.set(folder, new Set(defs));
    }
  }

  for (const folder of subdirs(fixturesDir)) {
    const known = knownDirs.get(folder);
    if (!known) {
      failures.push(`${folder}: fixture folder has no matching schema`);
      continue;
    }
    for (const sub of subdirs(join(fixturesDir, folder))) {
      if (!known.has(sub)) failures.push(`${folder}/${sub}: fixture folder has no matching schema`);
    }
  }

  for (const { ref, dir } of targets) {
    checked.push(ref);
    const valid = jsonFiles(join(dir, "valid"));
    const invalid = jsonFiles(join(dir, "invalid"));
    if (valid.length < 1)
      failures.push(`${ref}: needs at least 1 valid fixture, found ${valid.length}`);
    if (invalid.length < 2) {
      failures.push(`${ref}: needs at least 2 invalid fixtures, found ${invalid.length}`);
    }
    let cases: Record<string, { keyword?: string; instancePath?: string; errorCount?: number }> =
      {};
    if (invalid.length > 0) {
      try {
        cases = readJson(join(dir, "invalid", "cases.json")) as typeof cases;
      } catch {
        failures.push(`${ref}: invalid/cases.json is missing or unreadable`);
      }
    }
    for (const name of Object.keys(cases)) {
      if (!invalid.includes(name))
        failures.push(`${ref}: cases.json lists ${name} but the file is missing`);
    }
    const oracleValidate = oracle?.getSchema(ref);
    if (oracle && !oracleValidate) failures.push(`${ref}: oracle could not compile the schema`);

    for (const [kind, names] of [
      ["valid", valid],
      ["invalid", invalid],
    ] as const) {
      for (const name of names) {
        const label = `${ref} ${kind}/${name}`;
        const value = readJson(join(dir, kind, name));
        const result = registry.validate(ref, value);
        if (result.valid !== (kind === "valid")) {
          failures.push(`${label}: own validator says valid=${result.valid}`);
        }
        if (oracleValidate && oracleValidate(value) !== (kind === "valid")) {
          failures.push(`${label}: oracle disagrees with the folder`);
        }
        if (kind === "invalid" && !result.valid) {
          const expected = cases[name];
          if (!expected?.keyword || expected.instancePath === undefined) {
            failures.push(`${label}: no complete cases.json entry (keyword, instancePath)`);
            continue;
          }
          const first = result.errors[0];
          if (first?.keyword !== expected.keyword) {
            failures.push(`${label}: keyword ${first?.keyword} != ${expected.keyword}`);
          }
          if (first?.instancePath !== expected.instancePath) {
            failures.push(
              `${label}: instancePath ${first?.instancePath} != ${expected.instancePath}`,
            );
          }
          const count = expected.errorCount ?? 1;
          if (result.errors.length !== count) {
            failures.push(`${label}: errorCount ${result.errors.length} != ${count}`);
          }
        }
      }
    }
  }
  return { failures, checked };
}

// ---------------------------------------------------------------------------------------------

const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});

function write(root: string, files: Record<string, unknown>): void {
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(content));
  }
}

function sandbox(schemas: Record<string, unknown>, fixtures: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "agent-kit-conformance-"));
  tmp.push(root);
  write(join(root, "schemas"), schemas);
  write(join(root, "fixtures"), fixtures);
  return { schemas: join(root, "schemas"), fixtures: join(root, "fixtures") };
}

const xSchema = {
  $schema: DRAFT,
  $id: "urn:agent-kit:x:v1",
  type: "integer",
  minimum: 1,
};
const goodFixtures = {
  "x/valid/one.json": 1,
  "x/invalid/zero.json": 0,
  "x/invalid/text.json": "a",
  "x/invalid/cases.json": {
    "zero.json": { keyword: "minimum", instancePath: "" },
    "text.json": { keyword: "type", instancePath: "" },
  },
};

describe("harness (self-test)", () => {
  it("test_ca_26_maps_versions_to_folder_suffixes", () => {
    expect(fixtureFolder("urn:agent-kit:common:v1")).toBe("common");
    expect(fixtureFolder("urn:agent-kit:frontmatter:agent:v1")).toBe("frontmatter-agent");
    expect(fixtureFolder("urn:agent-kit:x:v2")).toBe("x-v2");
    const s = sandbox(
      { "x.v2.schema.json": { ...xSchema, $id: "urn:agent-kit:x:v2" } },
      Object.fromEntries(
        Object.entries(goodFixtures).map(([k, v]) => [k.replace("x/", "x-v2/"), v]),
      ),
    );
    expect(checkConformance(s.schemas, s.fixtures)).toEqual({
      failures: [],
      checked: ["urn:agent-kit:x:v2"],
    });
  });

  it("test_ca_26_accepts_a_complete_tree", () => {
    const s = sandbox({ "x.schema.json": xSchema }, goodFixtures);
    expect(checkConformance(s.schemas, s.fixtures)).toEqual({
      failures: [],
      checked: ["urn:agent-kit:x:v1"],
    });
  });

  it("test_ca_26_definition_only_schemas_are_checked_per_definition", () => {
    const defsOnly = {
      $schema: DRAFT,
      $id: "urn:agent-kit:d:v1",
      $defs: { a: { type: "integer" }, b: { type: "string", maxLength: 2 } },
    };
    const fx = (def: string, valid: unknown, i1: unknown, i2: unknown, kw: [string, string]) => ({
      [`d/${def}/valid/v.json`]: valid,
      [`d/${def}/invalid/i1.json`]: i1,
      [`d/${def}/invalid/i2.json`]: i2,
      [`d/${def}/invalid/cases.json`]: {
        "i1.json": { keyword: kw[0], instancePath: "" },
        "i2.json": { keyword: kw[1], instancePath: "" },
      },
    });
    const full = {
      ...fx("a", 1, "x", 1.5, ["type", "type"]),
      ...fx("b", "ab", "abc", 3, ["maxLength", "type"]),
    };
    const ok = sandbox({ "d.schema.json": defsOnly }, full);
    expect(checkConformance(ok.schemas, ok.fixtures).checked).toEqual([
      "urn:agent-kit:d:v1#/$defs/a",
      "urn:agent-kit:d:v1#/$defs/b",
    ]);
    expect(checkConformance(ok.schemas, ok.fixtures).failures).toEqual([]);
    // A $defs entry without fixtures fails.
    const missing = sandbox({ "d.schema.json": defsOnly }, fx("a", 1, "x", 1.5, ["type", "type"]));
    expect(checkConformance(missing.schemas, missing.fixtures).failures.join("\n")).toMatch(
      /#\/\$defs\/b: needs at least 1 valid/,
    );
  });

  it("test_ca_26_detects_missing_fixtures", () => {
    const none = sandbox({ "x.schema.json": xSchema }, {});
    const f = checkConformance(none.schemas, none.fixtures).failures.join("\n");
    expect(f).toMatch(/at least 1 valid/);
    expect(f).toMatch(/at least 2 invalid/);
    const oneInvalid = sandbox(
      { "x.schema.json": xSchema },
      {
        "x/valid/one.json": 1,
        "x/invalid/zero.json": 0,
        "x/invalid/cases.json": { "zero.json": { keyword: "minimum", instancePath: "" } },
      },
    );
    expect(checkConformance(oneInvalid.schemas, oneInvalid.fixtures).failures.join("\n")).toMatch(
      /at least 2 invalid/,
    );
    const noValid = sandbox(
      { "x.schema.json": xSchema },
      Object.fromEntries(Object.entries(goodFixtures).filter(([k]) => !k.includes("/valid/"))),
    );
    expect(checkConformance(noValid.schemas, noValid.fixtures).failures.join("\n")).toMatch(
      /at least 1 valid/,
    );
  });

  it("test_ca_26_detects_case_mismatches", () => {
    const run = (cases: unknown) =>
      sandbox({ "x.schema.json": xSchema }, { ...goodFixtures, "x/invalid/cases.json": cases });
    const failuresOf = (s: ReturnType<typeof sandbox>) =>
      checkConformance(s.schemas, s.fixtures).failures.join("\n");
    const base = {
      "zero.json": { keyword: "minimum", instancePath: "" },
      "text.json": { keyword: "type", instancePath: "" },
    };
    expect(failuresOf(run({ "zero.json": base["zero.json"] }))).toMatch(
      /text.json: no complete cases/,
    );
    expect(
      failuresOf(run({ ...base, "zero.json": { keyword: "maximum", instancePath: "" } })),
    ).toMatch(/keyword minimum != maximum/);
    expect(
      failuresOf(run({ ...base, "zero.json": { keyword: "minimum", instancePath: "/a" } })),
    ).toMatch(/instancePath .* != \/a/);
    expect(
      failuresOf(
        run({ ...base, "zero.json": { keyword: "minimum", instancePath: "", errorCount: 2 } }),
      ),
    ).toMatch(/errorCount 1 != 2/);
    expect(
      failuresOf(run({ ...base, "ghost.json": { keyword: "type", instancePath: "" } })),
    ).toMatch(/ghost.json but the file is missing/);
    expect(failuresOf(run("not an object"))).not.toBe("");
    const noCases = sandbox(
      { "x.schema.json": xSchema },
      Object.fromEntries(Object.entries(goodFixtures).filter(([k]) => !k.endsWith("cases.json"))),
    );
    expect(failuresOf(noCases)).toMatch(/cases.json is missing/);
  });

  it("test_ca_26_detects_wrong_folder_expectations", () => {
    const s = sandbox(
      { "x.schema.json": xSchema },
      { ...goodFixtures, "x/valid/bad.json": 0, "x/invalid/fine.json": 5 },
    );
    const f = checkConformance(s.schemas, s.fixtures).failures.join("\n");
    expect(f).toMatch(/valid\/bad.json: own validator says valid=false/);
    expect(f).toMatch(/invalid\/fine.json: own validator says valid=true/);
    expect(f).toMatch(/invalid\/fine.json: oracle disagrees/);
  });

  it("test_ca_26_detects_fixture_folders_without_schema", () => {
    const s = sandbox({ "x.schema.json": xSchema }, { ...goodFixtures, "orphan/valid/a.json": 1 });
    expect(checkConformance(s.schemas, s.fixtures).failures).toEqual([
      "orphan: fixture folder has no matching schema",
    ]);
    const defs = sandbox(
      {
        "d.schema.json": {
          $schema: DRAFT,
          $id: "urn:agent-kit:d:v1",
          $defs: { a: { type: "integer" } },
        },
      },
      { "d/ghost/valid/a.json": 1 },
    );
    expect(checkConformance(defs.schemas, defs.fixtures).failures.join("\n")).toMatch(
      /d\/ghost: fixture folder has no matching schema/,
    );
  });

  it("test_ca_26_a_broken_registry_is_a_failure", () => {
    const s = sandbox({ "x.schema.json": { ...xSchema, allOf: [] } }, goodFixtures);
    expect(checkConformance(s.schemas, s.fixtures).failures[0]).toMatch(
      /registry: .*x.schema.json/,
    );
  });
});

describe("repository schemas", () => {
  const result = checkConformance(REPO_SCHEMAS, REPO_FIXTURES);

  it("test_ca_26_every_schema_and_definition_has_fixtures", () => {
    expect(result.failures).toEqual([]);
    const registry = loadRegistry(REPO_SCHEMAS);
    expect(registry.ids.length).toBeGreaterThanOrEqual(5);
    for (const id of registry.ids) {
      const rooted = Object.keys(registry.schemaOf(id)).some((k) => !ANNOTATIONS.has(k));
      const expected = rooted ? [id] : registry.definitions(id).map((d) => `${id}#/$defs/${d}`);
      for (const ref of expected) expect(result.checked, ref).toContain(ref);
    }
  });

  it("test_ca_19_common_definitions", () => {
    for (const def of [
      "name",
      "description",
      "semver",
      "glob",
      "capability",
      "tier",
      "envelope-ref",
    ]) {
      expect(result.checked).toContain(`urn:agent-kit:common:v1#/$defs/${def}`);
    }
    expect(result.failures.filter((f) => f.includes("urn:agent-kit:common:v1"))).toEqual([]);
    // Boundary values called out by the spec, checked directly.
    const registry = loadRegistry(REPO_SCHEMAS);
    const name = (v: unknown) => registry.validate("urn:agent-kit:common:v1#/$defs/name", v).valid;
    expect(name("")).toBe(false);
    expect(name("a")).toBe(true);
    expect(name("a".repeat(64))).toBe(true);
    expect(name("a".repeat(65))).toBe(false);
    for (const bad of ["a--b", "a-", "-a", "A"]) expect(name(bad)).toBe(false);
    const semver = (v: unknown) =>
      registry.validate("urn:agent-kit:common:v1#/$defs/semver", v).valid;
    expect(semver("1.2.3-rc.1+b5")).toBe(true);
    expect(semver("01.2.3")).toBe(false);
    const ref = (v: unknown) =>
      registry.validate("urn:agent-kit:common:v1#/$defs/envelope-ref", v).valid;
    expect(ref("cortex.task/v1")).toBe(true);
    expect(ref("cortex.task")).toBe(false);
  });

  it("test_ca_20_frontmatter_schemas", () => {
    for (const type of ["agent", "skill", "workflow", "rule"]) {
      expect(result.checked).toContain(`urn:agent-kit:frontmatter:${type}:v1`);
    }
    expect(result.failures.filter((f) => f.includes("urn:agent-kit:frontmatter:"))).toEqual([]);
  });

  it("test_ca_27_oracle_and_own_validator_agree_on_every_fixture", () => {
    // The harness compares both with the folder expectation; here we also count the work done.
    const registry = loadRegistry(REPO_SCHEMAS);
    const oracle = makeOracle(registry);
    let compared = 0;
    for (const ref of result.checked) {
      const validate = oracle.getSchema(ref);
      expect(validate, ref).toBeTypeOf("function");
      const [id, fragment] = ref.split("#");
      const folder = fixtureFolder(id ?? "");
      const dir = fragment
        ? join(REPO_FIXTURES, folder, fragment.split("/").pop() ?? "")
        : join(REPO_FIXTURES, folder);
      for (const kind of ["valid", "invalid"]) {
        for (const file of jsonFiles(join(dir, kind))) {
          const value = readJson(join(dir, kind, file));
          expect(registry.validate(ref, value).valid, `${ref} ${file}`).toBe(validate?.(value));
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });
});

describe("prototype safety against the oracle", () => {
  it("test_ca_07_prototype_named_keys_match_the_oracle", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-kit-proto-"));
    tmp.push(dir);
    const schema = (name: string, body: Record<string, unknown>) =>
      write(dir, {
        [`${name}.schema.json`]: { $schema: DRAFT, $id: `urn:agent-kit:${name}:v1`, ...body },
      });
    schema("closed", {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: false,
    });
    schema("required", {
      type: "object",
      required: ["toString"],
      properties: { toString: { type: "string" } },
    });
    schema("lookup", {
      type: "object",
      properties: { hasOwnProperty: { type: "integer" } },
    });
    schema("open", { type: "object", properties: { name: { type: "string" } } });
    const registry = loadRegistry(dir);
    const oracle = makeOracle(registry);
    const cases: [string, string, boolean][] = [
      ["closed", '{"name":"a","constructor":{}}', false],
      ["closed", '{"name":"a","__proto__":{}}', false],
      ["closed", '{"name":"a"}', true],
      ["required", "{}", false],
      ["required", '{"toString":"x"}', true],
      ["required", '{"toString":1}', false],
      ["lookup", '{"hasOwnProperty":1}', true],
      ["lookup", '{"hasOwnProperty":"x"}', false],
      ["open", '{"name":"a","__proto__":1,"hasOwnProperty":2,"toString":3}', true],
      ["open", '{"name":1,"__proto__":{"name":"x"}}', false],
    ];
    for (const [name, text, expected] of cases) {
      const id = `urn:agent-kit:${name}:v1`;
      const value = JSON.parse(text);
      expect(registry.validate(id, value).valid, `${name} ${text}`).toBe(expected);
      expect(oracle.getSchema(id)?.(value), `oracle ${name} ${text}`).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Static ReDoS analysis of the patterns shipped under schemas/ (RNF-07).

interface Item {
  group?: Item[][]; // alternatives, for a group
  text: string;
  quantified: boolean;
  unbounded: boolean;
  max: number; // largest repeat count; Infinity when unbounded, 1 when not quantified
}

function parseRegex(src: string, problems: string[]): Item[][] {
  let i = 0;
  const parseAlternatives = (depth: number): Item[][] => {
    const alts: Item[][] = [[]];
    while (i < src.length) {
      const ch = src[i] as string;
      const seq = alts[alts.length - 1] as Item[];
      if (ch === ")") {
        if (depth === 0) throw new Error("unbalanced )");
        return alts;
      }
      if (ch === "|") {
        alts.push([]);
        i++;
        continue;
      }
      if (ch === "^" || ch === "$") {
        i++;
        continue;
      }
      let item: Item;
      if (ch === "(") {
        const rest = src.slice(i);
        if (/^\(\?(=|!|<=|<!)/.test(rest)) problems.push(`lookaround at ${i}`);
        const prefix = /^\((\?:|\?<[A-Za-z_][A-Za-z0-9_]*>)?/.exec(rest)?.[0] ?? "(";
        i += prefix.length;
        const group = parseAlternatives(depth + 1);
        i++; // the closing parenthesis
        item = { group, text: "(...)", quantified: false, unbounded: false, max: 1 };
      } else if (ch === "[") {
        const start = i++;
        while (i < src.length && src[i] !== "]") i += src[i] === "\\" ? 2 : 1;
        i++;
        item = { text: src.slice(start, i), quantified: false, unbounded: false, max: 1 };
      } else if (ch === "\\") {
        const next = src[i + 1] ?? "";
        const start = i;
        if (/[1-9]/.test(next) || (next === "k" && src[i + 2] === "<")) {
          problems.push(`backreference at ${i}`);
        }
        i += 2;
        if (next === "u" && src[i] === "{") i = src.indexOf("}", i) + 1;
        else if (next === "u") i += 4;
        else if (next === "x") i += 2;
        else if ((next === "p" || next === "P") && src[i] === "{") i = src.indexOf("}", i) + 1;
        item = { text: src.slice(start, i), quantified: false, unbounded: false, max: 1 };
      } else {
        item = { text: ch, quantified: false, unbounded: false, max: 1 };
        i++;
      }
      const q = /^(\*|\+|\?|\{\d+(,\d*)?\})\??/.exec(src.slice(i));
      if (q) {
        item.quantified = true;
        item.unbounded = q[1] === "*" || q[1] === "+" || /^\{\d+,\}$/.test(q[1] ?? "");
        const braces = /^\{(\d+)(?:,(\d*))?\}$/.exec(q[1] ?? "");
        if (item.unbounded) item.max = Number.POSITIVE_INFINITY;
        else if (braces) item.max = Number(braces[2] || braces[1]);
        else item.max = 1;
        i += q[0].length;
      }
      seq.push(item);
    }
    if (depth > 0) throw new Error("unbalanced (");
    return alts;
  };
  return parseAlternatives(0);
}

function bodyHasQuantifier(alts: Item[][]): boolean {
  return (
    alts.length > 1 ||
    alts.some((seq) => seq.some((it) => it.quantified || (it.group && bodyHasQuantifier(it.group))))
  );
}

function bodyHasUnbounded(alts: Item[][]): boolean {
  return alts.some((seq) =>
    seq.some((it) => it.unbounded || (it.group !== undefined && bodyHasUnbounded(it.group))),
  );
}

/**
 * A group repeated more than once over a body with an unbounded quantifier is risky, unless the body
 * starts with a plain separator atom that none of its unbounded atoms can match
 * (for example `(-[a-z0-9]+){0,31}`): the separator makes every split of the input unique.
 */
function repeatedUnboundedBody(item: Item): boolean {
  if (!item.group || item.max <= 1 || item.unbounded || !bodyHasUnbounded(item.group)) return false;
  const body = item.group[0];
  if (item.group.length === 1 && body) {
    const [separator, ...rest] = body;
    const plain = separator && !separator.group && !separator.quantified;
    const safe =
      plain &&
      rest.every((it) => !it.group && (!it.unbounded || !overlap(separator.text, it.text)));
    if (safe) return false;
  }
  return true;
}

function overlap(a: string, b: string): boolean {
  const ra = new RegExp(`^(?:${a})$`, "u");
  const rb = new RegExp(`^(?:${b})$`, "u");
  for (let code = 0; code < 0x300; code++) {
    const ch = String.fromCodePoint(code);
    if (ra.test(ch) && rb.test(ch)) return true;
  }
  return false;
}

function walkSequences(alts: Item[][], visit: (seq: Item[]) => void): void {
  for (const seq of alts) {
    visit(seq);
    for (const item of seq) if (item.group) walkSequences(item.group, visit);
  }
}

/** Returns the ReDoS-risk findings of one regular expression source (empty when it is safe). */
function analyzePattern(src: string): string[] {
  const problems: string[] = [];
  const alts = parseRegex(src, problems);
  walkSequences(alts, (seq) => {
    seq.forEach((item, index) => {
      if (item.group && item.unbounded && bodyHasQuantifier(item.group)) {
        problems.push("unbounded quantifier on a group that contains a quantifier or alternation");
      }
      if (repeatedUnboundedBody(item)) {
        problems.push("repeated group over a body with an unbounded quantifier");
      }
      const next = seq[index + 1];
      if (!next || !item.unbounded || !next.unbounded) return;
      if (item.group && next.group) problems.push("adjacent unbounded groups");
      else if (!item.group && !next.group && overlap(item.text, next.text)) {
        problems.push(
          `adjacent unbounded atoms with overlapping classes: ${item.text} ${next.text}`,
        );
      }
    });
  });
  return problems;
}

function collectPatterns(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectPatterns(child, out);
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "pattern" && typeof value === "string") out.push(value);
      if (key === "patternProperties" && typeof value === "object" && value !== null) {
        out.push(...Object.keys(value));
      }
      collectPatterns(value, out);
    }
  }
}

function schemaFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? schemaFiles(join(dir, e.name))
      : e.name.endsWith(".schema.json")
        ? [join(dir, e.name)]
        : [],
  );
}

describe("static ReDoS rules", () => {
  it("test_ca_09_repository_patterns_are_safe", () => {
    const patterns: string[] = [];
    for (const file of schemaFiles(REPO_SCHEMAS)) collectPatterns(readJson(file), patterns);
    expect(patterns.length).toBeGreaterThanOrEqual(5);
    for (const pattern of patterns) expect(analyzePattern(pattern), pattern).toEqual([]);
  });

  it.each([
    "^(a+)+$",
    "(a|aa)*",
    "(a*)*b",
    "(\\w+\\s?)+",
    "(a+)+(b+)+",
    "^a*a*a*b$",
    "(?=a)a",
    "(?!a)b",
    "(?<=a)b",
    "(?<!a)b",
    "(a)\\1",
    "(?<n>a)\\k<n>",
    "^(a{2,})*$",
    "^\\w+\\d+$",
    "^(a+){2,31}$",
    "^(a+){1,2}$",
    "^(a|b+){2,3}$",
  ])("test_ca_09_self_test_catches_%s", (pattern) => {
    expect(analyzePattern(pattern).length, pattern).toBeGreaterThan(0);
  });

  it.each([
    "^x-[a-z0-9-]{1,62}$",
    "^[a-z][a-z0-9]*(-[a-z0-9]+){0,31}$",
    "^cortex\\.[a-z]+/v[0-9]+$",
    "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
    "^a*b*c*$",
    "^(?:ab){1,3}$",
    "^(-[a-z0-9]+){0,31}$",
  ])("test_ca_09_self_test_accepts_%s", (pattern) => {
    expect(analyzePattern(pattern), pattern).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Provider neutrality (RF-20, RNF-10).

const DENYLIST = new Set([
  "claude",
  "anthropic",
  "opus",
  "sonnet",
  "haiku",
  "gpt",
  "openai",
  "gemini",
  "google",
  "llama",
  "mistral",
  "deepseek",
  "grok",
  "codex",
  "antigravity",
]);

/** Findings for denylisted words (whole words, case-insensitive) in any key or string value. */
function neutralityFindings(node: unknown, path = ""): string[] {
  const findings: string[] = [];
  const scan = (text: string, where: string) => {
    for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (DENYLIST.has(token)) findings.push(`${where}: ${token}`);
    }
  };
  if (typeof node === "string") {
    scan(node, path);
  } else if (Array.isArray(node)) {
    for (const [i, child] of node.entries()) {
      findings.push(...neutralityFindings(child, `${path}/${i}`));
    }
  } else if (typeof node === "object" && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      scan(key, `${path}/${key} (key)`);
      if (key === "model") findings.push(`${path}/${key}: model property`);
      findings.push(...neutralityFindings(value, `${path}/${key}`));
    }
  }
  return findings;
}

describe("provider neutrality", () => {
  it("test_ca_21_schemas_name_no_model_or_vendor", () => {
    const files = schemaFiles(REPO_SCHEMAS);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) expect(neutralityFindings(readJson(file), file), file).toEqual([]);
  });

  it("test_ca_21_self_test_catches_planted_names", () => {
    expect(neutralityFindings({ description: "Claude" })).not.toEqual([]);
    expect(neutralityFindings({ properties: { x: { const: "gpt-4" } } })).not.toEqual([]);
    expect(neutralityFindings({ gemini: 1 })).not.toEqual([]);
    expect(neutralityFindings({ properties: { model: { type: "string" } } })).not.toEqual([]);
    expect(neutralityFindings({ list: ["fine", "Use OPENAI here"] })).not.toEqual([]);
    expect(neutralityFindings({ description: "A neutral tier", enum: ["fast"] })).toEqual([]);
    expect(neutralityFindings({ description: "Gemini-like", note: "gptx" })).toHaveLength(1);
  });
});
