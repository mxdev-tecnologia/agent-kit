import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isDateTime, isUuid } from "../src/schemas/formats.js";
import type { Registry } from "../src/schemas/registry.js";
import { expectedSchemaId, loadRegistry, RegistryLoadError } from "../src/schemas/registry.js";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const ID = "urn:agent-kit:t:v1";
const tmp: string[] = [];

afterEach(() => {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Writes `files` (relative path to schema object or raw text) in a temp dir. */
function tree(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-kit-schemas-"));
  tmp.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

const withId = (body: Record<string, unknown>, id = ID) => ({ $schema: DRAFT, $id: id, ...body });

function one(body: Record<string, unknown>): Registry {
  return loadRegistry(tree({ "t.schema.json": withId(body) }));
}

function loadError(files: Record<string, unknown>): string {
  try {
    loadRegistry(tree(files));
  } catch (error) {
    expect(error).toBeInstanceOf(RegistryLoadError);
    return (error as Error).message;
  }
  throw new Error("expected loadRegistry to fail");
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const ok = (r: Registry, value: unknown, id = ID) => r.validate(id, value).valid;

describe("validate", () => {
  it("test_ca_01_valid_invalid_frozen_unknown_id_and_fragment", () => {
    const r = one({
      type: "object",
      required: ["a"],
      properties: { a: { type: "string" } },
      $defs: { n: { type: "integer" } },
    });
    expect(r.validate(ID, deepFreeze({ a: "x" }))).toEqual({ valid: true });
    const bad = r.validate(ID, deepFreeze({ a: 1 }));
    expect(bad.valid).toBe(false);
    if (!bad.valid) {
      expect(bad.errors[0]).toMatchObject({ instancePath: "/a", keyword: "type" });
      expect(typeof bad.errors[0]?.message).toBe("string");
    }
    expect(() => r.validate("urn:agent-kit:nope:v1", {})).toThrow("urn:agent-kit:nope:v1");
    expect(() => r.validate(`${ID}#/$defs/missing`, 1)).toThrow(`${ID}#/$defs/missing`);
    expect(r.validate(`${ID}#/$defs/n`, 3).valid).toBe(true);
    expect(r.validate(`${ID}#/$defs/n`, "3").valid).toBe(false);
  });

  it("test_ca_02_type_keywords", () => {
    const t = (type: unknown, pass: unknown[], fail: unknown[]) => {
      const r = one({ type });
      for (const v of pass)
        expect(ok(r, v), `${JSON.stringify(type)} ${JSON.stringify(v)}`).toBe(true);
      for (const v of fail)
        expect(ok(r, v), `${JSON.stringify(type)} ${JSON.stringify(v)}`).toBe(false);
    };
    t("string", ["a"], [1, null, {}, []]);
    t("number", [1, 1.5], ["1", null]);
    t("integer", [1, 0, 2.0], [1.5, "1"]);
    t("boolean", [true], [0, "true"]);
    t("object", [{}], [[], null, 1]);
    t("array", [[]], [{}, "a"]);
    t("null", [null], [0, ""]);
    t(["string", "null"], ["a", null], [1, {}]);
  });

  it("test_ca_02_const_enum_and_deep_equality", () => {
    const c = one({ const: { a: [1, { b: null }] } });
    expect(ok(c, { a: [1, { b: null }] })).toBe(true);
    expect(ok(c, { a: [1, { b: 0 }] })).toBe(false);
    const e = one({ enum: ["x", 2, null, [1]] });
    for (const v of ["x", 2, null, [1]]) expect(ok(e, v)).toBe(true);
    for (const v of ["y", 3, 0, [2]]) expect(ok(e, v)).toBe(false);
  });

  it("test_ca_02_string_keywords_count_code_points", () => {
    const r = one({ type: "string", minLength: 2, maxLength: 3 });
    expect(ok(r, "ab")).toBe(true);
    expect(ok(r, "a")).toBe(false);
    expect(ok(r, "😀")).toBe(false); // one code point, below minLength 2
    expect(ok(r, "😀😀")).toBe(true); // two code points, four UTF-16 units
    expect(ok(r, "😀😀😀")).toBe(true);
    expect(ok(r, "😀😀😀😀")).toBe(false);
    const p = one({ type: "string", maxLength: 10, pattern: "^[a-z]+$" });
    expect(ok(p, "abc")).toBe(true);
    expect(ok(p, "ab1")).toBe(false);
    // The pattern runs with the u flag: \u{1F600} is one code point.
    const u = one({ type: "string", maxLength: 4, pattern: "^\\u{1F600}$" });
    expect(ok(u, "😀")).toBe(true);
  });

  it("test_ca_02_number_keywords", () => {
    const r = one({ type: "number", minimum: 1, maximum: 3 });
    for (const v of [1, 2, 3]) expect(ok(r, v)).toBe(true);
    for (const v of [0, 0.99, 3.01]) expect(ok(r, v)).toBe(false);
  });

  it("test_ca_02_array_keywords", () => {
    const r = one({
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "object" },
    });
    expect(ok(r, [{ a: 1 }, { a: 2 }])).toBe(true);
    expect(ok(r, [])).toBe(false);
    expect(ok(r, [{}, { x: 1 }, { y: 1 }, { z: 1 }])).toBe(false);
    expect(
      ok(r, [
        { a: 1, b: [1] },
        { b: [1], a: 1 },
      ]),
    ).toBe(false); // equal objects
    expect(ok(r, [1])).toBe(false);
    const u = one({ type: "array", uniqueItems: true });
    expect(ok(u, [1, "1", true, null, [1], { a: 1 }])).toBe(true);
    expect(
      ok(u, [
        [1, 2],
        [1, 2],
      ]),
    ).toBe(false);
  });

  it("test_ca_02_object_keywords", () => {
    const closed = one({
      type: "object",
      properties: { a: { type: "integer" } },
      required: ["a"],
      additionalProperties: false,
      maxProperties: 1,
    });
    expect(ok(closed, { a: 1 })).toBe(true);
    expect(ok(closed, {})).toBe(false);
    expect(ok(closed, { a: 1, b: 2 })).toBe(false);
    expect(ok(closed, { a: "x" })).toBe(false);

    const open = one({
      type: "object",
      properties: { a: { type: "integer" } },
      additionalProperties: { type: "string" },
    });
    expect(ok(open, { a: 1, b: "x" })).toBe(true);
    expect(ok(open, { a: 1, b: 2 })).toBe(false);
    expect(ok(one({ type: "object", additionalProperties: true }), { z: 1 })).toBe(true);

    const pp = one({
      type: "object",
      patternProperties: { "^x-[a-z]{1,3}$": { type: "integer" } },
      additionalProperties: false,
    });
    expect(ok(pp, { "x-ab": 1 })).toBe(true);
    expect(ok(pp, { "x-ab": "1" })).toBe(false);
    expect(ok(pp, { y: 1 })).toBe(false);
    expect(ok(pp, { "X-ab": 1 })).toBe(false);

    const max = one({ type: "object", maxProperties: 1 });
    expect(ok(max, { a: 1 })).toBe(true);
    expect(ok(max, { a: 1, b: 2 })).toBe(false);
  });

  it("test_ca_02_one_of_any_of", () => {
    const one1 = one({ oneOf: [{ type: "integer" }, { type: "number", minimum: 2 }] });
    expect(ok(one1, 1)).toBe(true); // integer only
    expect(ok(one1, 2.5)).toBe(true); // second only
    expect(ok(one1, 3)).toBe(false); // both
    expect(ok(one1, "x")).toBe(false); // none
    const any = one({ anyOf: [{ type: "integer" }, { type: "number", minimum: 2 }] });
    expect(ok(any, 3)).toBe(true);
    expect(ok(any, 1)).toBe(true);
    expect(ok(any, "x")).toBe(false);
  });

  it("test_ca_02_annotations_are_ignored", () => {
    const r = one({ title: "t", description: "d", examples: [1], default: 5, type: "integer" });
    expect(ok(r, 1)).toBe(true);
    expect(ok(r, "x")).toBe(false);
  });
});

describe("schema loading", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["allOf", { allOf: [{}] }, "/allOf"],
    ["if", { if: {} }, "/if"],
    ["not", { not: {} }, "/not"],
    ["contains", { contains: {} }, "/contains"],
    ["nested $id", { properties: { a: { $id: "x" } } }, "/properties/a/$id"],
    ["nested $schema", { items: { $schema: DRAFT } }, "/items/$schema"],
    ["nested $defs", { items: { $defs: {} } }, "/items/$defs"],
    ["required string", { required: "x" }, "/required"],
    ["type int", { type: "int" }, "/type"],
    ["type empty list", { type: [] }, "/type"],
    ["bad pattern", { type: "string", maxLength: 3, pattern: "(" }, "/pattern"],
    ["negative minLength", { minLength: -1 }, "/minLength"],
    ["fractional maxItems", { maxItems: 1.5 }, "/maxItems"],
    ["empty enum", { enum: [] }, "/enum"],
    ["duplicate required", { required: ["a", "a"] }, "/required"],
    [
      "bad nested keyword",
      { properties: { a: { properties: { b: { foo: 1 } } } } },
      "/properties/a/properties/b/foo",
    ],
    ["additionalProperties number", { additionalProperties: 1 }, "/additionalProperties"],
    ["non-object schema", { items: true }, "/items"],
    ["format email", { type: "string", format: "email" }, "/format"],
    ["pattern without maxLength", { type: "string", pattern: "^a$" }, "/pattern"],
    [
      "unbounded patternProperties key",
      { type: "object", patternProperties: { "^a+$": {} } },
      "/patternProperties/^a+$",
    ],
    ["bad patternProperties key", { patternProperties: { "(": {} } }, "/patternProperties/("],
  ];

  it.each(cases)("test_ca_03_load_error_%s", (_name, body, pointer) => {
    const message = loadError({ "t.schema.json": withId(body) });
    expect(message).toContain("t.schema.json");
    expect(message).toContain(`: ${pointer}:`);
  });

  it("test_ca_03_unbounded_pattern_properties_allowed_when_closed", () => {
    const r = one({
      type: "object",
      patternProperties: { "^a+$": { type: "integer" } },
      additionalProperties: false,
    });
    expect(ok(r, { aaa: 1 })).toBe(true);
  });

  it("test_ca_04_refs_resolve", () => {
    const dir = tree({
      "a.schema.json": withId(
        { type: "string", maxLength: 5, $defs: { d: { type: "string", minLength: 2 } } },
        "urn:agent-kit:a:v1",
      ),
      "b.schema.json": withId(
        {
          type: "object",
          properties: {
            whole: { $ref: "urn:agent-kit:a:v1" },
            def: { $ref: "urn:agent-kit:a:v1#/$defs/d" },
            local: { $ref: "#/$defs/s", maxLength: 2 },
          },
          $defs: { s: { type: "string", minLength: 1 } },
        },
        "urn:agent-kit:b:v1",
      ),
    });
    const r = loadRegistry(dir);
    const b = "urn:agent-kit:b:v1";
    expect(ok(r, { whole: "abc", def: "ab", local: "ab" }, b)).toBe(true);
    expect(ok(r, { whole: "abcdef" }, b)).toBe(false);
    expect(ok(r, { def: "a" }, b)).toBe(false);
    expect(ok(r, { local: "" }, b)).toBe(false);
    expect(ok(r, { local: "abc" }, b)).toBe(false); // sibling keyword enforced
  });

  it.each([
    ["remote https", { $ref: "https://example.com/x.json" }, "/$ref"],
    ["remote file", { $ref: "file:///x.json" }, "/$ref"],
    ["relative path", { $ref: "./other.schema.json" }, "/$ref"],
    ["unresolved local", { $ref: "#/$defs/nope" }, "/$ref"],
    ["unresolved id", { $ref: "urn:agent-kit:zzz:v1" }, "/$ref"],
    ["inherited constructor", { $ref: "#/$defs/constructor" }, "/$ref"],
    ["whole document pointer", { $ref: "#" }, "/$ref"],
    ["arbitrary pointer", { $ref: "#/properties/a" }, "/$ref"],
  ])("test_ca_04_ref_load_error_%s", (_name, ref, pointer) => {
    const message = loadError({
      "t.schema.json": withId({ type: "object", properties: { a: ref } }),
    });
    expect(message).toContain("t.schema.json");
    expect(message).toContain(`/properties/a${pointer}`);
  });

  it("test_ca_04_cyclic_refs_fail", () => {
    const message = loadError({
      "t.schema.json": withId({
        $defs: { a: { $ref: "#/$defs/b" }, b: { $ref: "#/$defs/a" } },
      }),
    });
    expect(message).toContain("t.schema.json");
    expect(message).toContain("cycle");
    expect(message).toMatch(/\/\$defs\/[ab]\/\$ref/);
  });

  it("test_ca_04_self_and_cross_file_cycles_fail", () => {
    expect(loadError({ "t.schema.json": withId({ properties: { p: { $ref: ID } } }) })).toContain(
      "cycle",
    );
    const message = loadError({
      "a.schema.json": withId(
        { properties: { p: { $ref: "urn:agent-kit:b:v1" } } },
        "urn:agent-kit:a:v1",
      ),
      "b.schema.json": withId(
        { properties: { p: { $ref: "urn:agent-kit:a:v1" } } },
        "urn:agent-kit:b:v1",
      ),
    });
    expect(message).toContain("cycle");
  });

  it("test_ca_05_date_time_vectors", () => {
    const valid = [
      "2026-01-02T03:04:05Z",
      "2026-01-02t03:04:05z",
      "2026-01-02T03:04:05.123456Z",
      "2026-01-02T03:04:05+02:00",
      "2024-02-29T00:00:00Z",
      "2026-12-31T23:59:60Z",
    ];
    const invalid = [
      "2026-02-30T00:00:00Z",
      "2026-02-29T00:00:00Z",
      "2026-13-01T00:00:00Z",
      "2026-01-02T24:00:00Z",
      "2026-01-02T03:04:60Z",
      "2026-01-02T03:04:05",
      "2026-01-02 03:04:05Z",
      "2026-01-02T03:04:05.Z",
      "2026-01-02T03:04:05+24:00",
      "2026-01-02T03:04:05+0200",
    ];
    const r = one({ type: "string", format: "date-time" });
    for (const v of valid) {
      expect(ok(r, v), v).toBe(true);
      expect(isDateTime(v), v).toBe(true);
    }
    for (const v of invalid) {
      expect(ok(r, v), v).toBe(false);
      expect(isDateTime(v), v).toBe(false);
    }
  });

  it("test_ca_05_uuid_vectors_and_non_strings", () => {
    const valid = [
      "123e4567-e89b-12d3-a456-426614174000",
      "123E4567-E89B-12D3-A456-426614174000",
      "123e4567-E89B-12d3-A456-426614174000",
      "00000000-0000-0000-0000-000000000000",
    ];
    const invalid = [
      "urn:uuid:123e4567-e89b-12d3-a456-426614174000",
      "{123e4567-e89b-12d3-a456-426614174000}",
      "123e4567e89b12d3a456426614174000",
      "123e4567-e89b-12d3-a456-42661417400",
      "123e4567-e89b-12d3-a456-4266141740000",
      "123e4567-e89b-12d3-a456-42661417400g",
    ];
    const r = one({ type: "string", format: "uuid" });
    for (const v of valid) expect(ok(r, v) && isUuid(v), v).toBe(true);
    for (const v of invalid) expect(ok(r, v) || isUuid(v), v).toBe(false);
    const free = one({ format: "uuid" });
    for (const v of [1, null, true, {}, []]) expect(ok(free, v)).toBe(true);
  });

  it("test_ca_06_error_limit_and_truncation", () => {
    const r = one({
      type: "object",
      properties: {
        list: { type: "array", items: { type: "integer" } },
        pick: { enum: ["a", "b"] },
      },
      additionalProperties: false,
    });
    const list = r.validate(ID, { list: Array.from({ length: 200 }, () => "x") });
    expect(list.valid).toBe(false);
    if (!list.valid) {
      expect(list.errors).toHaveLength(50);
      for (const e of list.errors) {
        expect(e.instancePath.startsWith("/list/")).toBe(true);
        expect(e.keyword).toBe("type");
        expect(e.message.length).toBeGreaterThan(0);
      }
    }
    const long = "k".repeat(500);
    for (const instance of [{ pick: long }, { [long]: 1 }]) {
      const res = r.validate(ID, instance);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.errors.length).toBeGreaterThan(0);
        for (const e of res.errors) {
          expect(e.instancePath).toBeTypeOf("string");
          expect(e.keyword).toBeTypeOf("string");
          for (const text of [e.message, e.instancePath]) {
            expect(text).not.toMatch(/k{81}/);
            expect(Array.from(text.match(/k+/g)?.[0] ?? "").length).toBeLessThanOrEqual(80);
          }
        }
        expect(res.errors.some((e) => e.message.includes("…"))).toBe(true);
      }
    }
    // A long key below a property path is truncated in instancePath too.
    const deep = one({
      type: "object",
      patternProperties: { "^k{1,600}$": { type: "integer" } },
      additionalProperties: false,
    });
    const res = deep.validate(ID, { [long]: "x" });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors[0]?.instancePath).not.toMatch(/k{81}/);
  });

  it("test_ca_07_prototype_names_are_ordinary_data", () => {
    const r = one({
      type: "object",
      properties: { name: { type: "string" }, hasOwnProperty: { type: "integer" } },
      additionalProperties: false,
    });
    expect(ok(r, JSON.parse('{"name":"a","constructor":{}}'))).toBe(false);
    expect(ok(r, JSON.parse('{"name":"a","__proto__":{}}'))).toBe(false);
    expect(ok(r, JSON.parse('{"hasOwnProperty":1}'))).toBe(true);
    expect(ok(r, JSON.parse('{"hasOwnProperty":"x"}'))).toBe(false);
    const req = one({
      type: "object",
      required: ["toString"],
      properties: { toString: { type: "string" } },
    });
    expect(ok(req, {})).toBe(false);
    expect(ok(req, { toString: "x" })).toBe(true);
    // A property named __proto__ in the schema is looked up as an own property.
    const proto = one(
      JSON.parse('{"type":"object","properties":{"__proto__":{"type":"integer"}}}'),
    );
    expect(ok(proto, JSON.parse('{"__proto__":1}'))).toBe(true);
    expect(ok(proto, JSON.parse('{"__proto__":"x"}'))).toBe(false);
    expect(ok(proto, {})).toBe(true);
    // Inherited names are not schemas.
    const inherited = one({ type: "object", properties: { a: { type: "string" } } });
    expect(ok(inherited, { toString: 1, constructor: 1 })).toBe(true);
    // Registry ids are looked up as own entries only.
    expect(() => inherited.validate("constructor", {})).toThrow("constructor");
    expect(() => inherited.validate("__proto__", {})).toThrow("__proto__");
    expect(() => inherited.validate(`${ID}#/$defs/constructor`, {})).toThrow("constructor");
  });

  it("test_ca_08_redos_pattern_is_skipped_after_max_length", () => {
    const r = one({ type: "string", maxLength: 32, pattern: "^(a+)+$" });
    const evil = `${"a".repeat(9999)}b`;
    const start = performance.now();
    const res = r.validate(ID, evil);
    expect(performance.now() - start).toBeLessThan(100);
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.map((e) => e.keyword)).toEqual(["maxLength"]);
    expect(loadError({ "t.schema.json": withId({ type: "string", pattern: "^a$" }) })).toContain(
      "maxLength",
    );
  });

  it("test_ca_10_default_never_changes_or_fills_the_instance", () => {
    const r = one({
      type: "object",
      required: ["a"],
      properties: { a: { type: "integer", default: 5 }, b: { type: "string", default: "x" } },
    });
    const instance = deepFreeze({ b: "y" } as Record<string, unknown>);
    expect(ok(r, instance)).toBe(false); // `a` is required even though it has a default
    expect(instance).toEqual({ b: "y" });
    const optional = one({
      type: "object",
      properties: { a: { type: "integer", default: "not-an-integer" } },
    });
    const empty = deepFreeze({});
    expect(ok(optional, empty)).toBe(true);
    expect(empty).toEqual({});
  });
});

describe("registry", () => {
  it("test_ca_11_loads_nested_tree_and_ignores_other_files", () => {
    const dir = tree({
      "one.schema.json": withId({}, "urn:agent-kit:one:v1"),
      "deep/er/two.schema.json": withId({}, "urn:agent-kit:deep:er:two:v1"),
      "deep/two.v2.schema.json": withId({}, "urn:agent-kit:deep:two:v2"),
      "README.md": "not a schema",
      "notes.json": "{ not json",
      "deep/.gitkeep": "",
    });
    const r = loadRegistry(dir);
    expect([...r.ids].sort()).toEqual([
      "urn:agent-kit:deep:er:two:v1",
      "urn:agent-kit:deep:two:v2",
      "urn:agent-kit:one:v1",
    ]);
    expect(r.has("urn:agent-kit:one:v1")).toBe(true);
    expect(r.has("urn:agent-kit:nope:v1")).toBe(false);
  });

  it("test_ca_11_empty_directory_is_an_empty_registry", () => {
    expect(loadRegistry(tree({})).ids).toEqual([]);
  });

  it("test_ca_12_id_and_schema_rules", () => {
    const bad: [string, Record<string, unknown>, string][] = [
      ["missing-id.schema.json", { $schema: DRAFT }, "$id"],
      ["wrong-id.schema.json", withId({}, "urn:agent-kit:other:v1"), "wrong-id.schema.json"],
      [
        "wrong-schema.schema.json",
        {
          $schema: "http://json-schema.org/draft-07/schema#",
          $id: "urn:agent-kit:wrong-schema:v1",
        },
        "$schema",
      ],
      ["missing-schema.schema.json", { $id: "urn:agent-kit:missing-schema:v1" }, "$schema"],
      ["x.v1.schema.json", withId({}, "urn:agent-kit:x:v1"), "x.v1.schema.json"],
      ["y.v0.schema.json", withId({}, "urn:agent-kit:y:v0"), "y.v0.schema.json"],
    ];
    for (const [file, content, needle] of bad) {
      const message = loadError({ [file]: content });
      expect(message, file).toContain(file);
      expect(message, file).toContain(needle);
    }
    // Duplicate $id across two files.
    const dup = loadError({
      "a.schema.json": withId({}, "urn:agent-kit:a:v1"),
      "sub/a.schema.json": withId({}, "urn:agent-kit:a:v1"),
    });
    expect(dup).toContain("a.schema.json");
    expect(dup).toContain("duplicate");
    // Valid pair.
    const r = loadRegistry(
      tree({
        "x.schema.json": withId({}, "urn:agent-kit:x:v1"),
        "x.v2.schema.json": withId({}, "urn:agent-kit:x:v2"),
      }),
    );
    expect([...r.ids].sort()).toEqual(["urn:agent-kit:x:v1", "urn:agent-kit:x:v2"]);
  });

  it("test_ca_12_path_separators_are_normalized", () => {
    expect(expectedSchemaId("frontmatter/agent.schema.json")).toEqual({
      id: "urn:agent-kit:frontmatter:agent:v1",
    });
    expect(expectedSchemaId("frontmatter\\agent.schema.json")).toEqual({
      id: "urn:agent-kit:frontmatter:agent:v1",
    });
    expect(expectedSchemaId("a\\b.v3.schema.json")).toEqual({ id: "urn:agent-kit:a:b:v3" });
    expect(expectedSchemaId("x.v1.schema.json")).toHaveProperty("error");
    expect(expectedSchemaId("x.v0.schema.json")).toHaveProperty("error");
    expect(expectedSchemaId("x.v02.schema.json")).toHaveProperty("error");
    expect(expectedSchemaId("x.json")).toHaveProperty("error");
  });

  it("test_ca_12_collects_errors_of_several_files", () => {
    const message = loadError({
      "a.schema.json": withId({ allOf: [] }, "urn:agent-kit:a:v1"),
      "b.schema.json": withId({ not: {} }, "urn:agent-kit:b:v1"),
      "c.schema.json": "{ broken",
    });
    for (const f of ["a.schema.json", "b.schema.json", "c.schema.json"]) {
      expect(message).toContain(f);
    }
  });
});

describe("performance", () => {
  const factor = process.platform === "win32" ? 4 : 1;
  const median = (fn: () => void): number => {
    for (let i = 0; i < 3; i++) fn();
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      fn();
      times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[2] ?? Number.POSITIVE_INFINITY;
  };

  it("test_ca_29_load_and_validate_within_budget", () => {
    const dir = join(import.meta.dirname, "..", "schemas");
    expect(median(() => loadRegistry(dir))).toBeLessThan(50 * factor);

    const registry = loadRegistry(dir);
    const id = "urn:agent-kit:frontmatter:agent:v1";
    const instances = Array.from({ length: 1000 }, (_, n) => ({
      format: "agent-kit/v1",
      name: `agent-${n}`,
      description: "d".repeat(900),
      title: "Senior reviewer",
      capabilities: ["read", "search", "edit", "shell", "web", "mcp"],
      tier: "standard",
      emits: Array.from({ length: 20 }, (_, k) => `cortex.task${"x".repeat(k % 3)}/v1`),
      verifier: n % 2 === 0,
      "x-note": "n".repeat(300),
    }));
    expect(JSON.stringify(instances[0]).length).toBeGreaterThan(1500);
    expect(registry.validate(id, instances[0]).valid).toBe(true);
    const time = median(() => {
      for (const instance of instances) registry.validate(id, instance);
    });
    expect(time).toBeLessThan(500 * factor);
  });
});
