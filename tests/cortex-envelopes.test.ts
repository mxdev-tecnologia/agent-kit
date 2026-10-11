import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/schemas/registry.js";

const SCHEMAS = join(import.meta.dirname, "..", "schemas");
const FIXTURES = join(import.meta.dirname, "fixtures", "schemas");
const KINDS = [
  "task",
  "result",
  "blocked",
  "verdict",
  "plan",
  "handoff",
  "lesson",
  "design",
  "observation",
] as const;
const DEFS_ID = "urn:agent-kit:cortex:defs:v1";
const COMMON_ID = "urn:agent-kit:common:v1";
const idOf = (kind: string) => `urn:agent-kit:cortex:${kind}:v1`;

type Node = Record<string, unknown>;
const registry = loadRegistry(SCHEMAS);
const schemaOf = (kind: string) => registry.schemaOf(idOf(kind)) as Node;
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every schema node of a document with the keyword path that reaches it (keywords only). */
function walk(node: Node, path: string[] = []): { node: Node; path: string[] }[] {
  const out = [{ node, path }];
  for (const key of ["$defs", "properties", "patternProperties"]) {
    const map = node[key];
    if (!isNode(map)) continue;
    for (const [name, child] of Object.entries(map)) {
      if (isNode(child)) out.push(...walk(child, [...path, key, name]));
    }
  }
  for (const key of ["items", "additionalProperties"]) {
    const child = node[key];
    if (isNode(child)) out.push(...walk(child, [...path, key]));
  }
  for (const key of ["oneOf", "anyOf"]) {
    const list = node[key];
    if (Array.isArray(list)) {
      list.forEach((child, i) => {
        if (isNode(child)) out.push(...walk(child, [...path, key, String(i)]));
      });
    }
  }
  return out;
}

// --- CA-05 --------------------------------------------------------------------------------
const BANNED = ["allOf", "if", "then", "else", "not", "contains"];
const REF_OK = /^urn:agent-kit:(cortex:defs|common):v1#\/\$defs\/[a-z-]+$/;

function bannedKeywords(schema: Node): string[] {
  const found: string[] = [];
  for (const { node, path } of walk(schema)) {
    for (const key of BANNED) {
      if (Object.hasOwn(node, key)) found.push(`${path.join("/")}:${key}`);
    }
  }
  return found;
}

// --- CA-16 --------------------------------------------------------------------------------
function structuralProblems(schema: Node): string[] {
  const problems: string[] = [];
  for (const { node, path } of walk(schema)) {
    const where = path.join("/") || "(root)";
    if (path.length === 0 && Object.hasOwn(node, "$defs")) continue; // definitions container
    const hasKind = ["type", "const", "enum", "$ref"].some((k) => Object.hasOwn(node, k));
    if (!hasKind) problems.push(`${where}: no type, const, enum or $ref`);
    const fixed = Object.hasOwn(node, "const") || Object.hasOwn(node, "enum");
    if (node.type === "string" && !fixed && typeof node.maxLength !== "number") {
      problems.push(`${where}: string without maxLength`);
    }
    if (node.type === "array" && typeof node.maxItems !== "number") {
      problems.push(`${where}: array without maxItems`);
    }
    if (node.type === "object" && node.additionalProperties !== false) {
      problems.push(`${where}: object without additionalProperties false`);
    }
    if (
      (node.type === "number" || node.type === "integer") &&
      (typeof node.minimum !== "number" || typeof node.maximum !== "number")
    ) {
      problems.push(`${where}: number without minimum and maximum`);
    }
    if (isNode(node.patternProperties) && typeof node.maxProperties !== "number") {
      problems.push(`${where}: patternProperties without maxProperties`);
    }
  }
  return problems;
}

// --- CA-17: size model --------------------------------------------------------------------
function resolve(ref: string): Node {
  const [id, fragment] = ref.split("#");
  const def = (fragment ?? "").split("/").pop() ?? "";
  const defs = (registry.schemaOf(id ?? "") as Node).$defs as Record<string, Node>;
  return defs[def] as Node;
}

/** Worst-case bytes of a compact `JSON.stringify` of an instance (spec Design, "Size model"). */
function cost(node: Node): number {
  if (typeof node.$ref === "string") return cost(resolve(node.$ref));
  if (typeof node.const === "string") return node.const.length + 2;
  if (Array.isArray(node.enum)) {
    return Math.max(...node.enum.map((v) => (typeof v === "string" ? v.length + 2 : 24)));
  }
  if (Array.isArray(node.oneOf) || Array.isArray(node.anyOf)) {
    return Math.max(...((node.oneOf ?? node.anyOf) as Node[]).map(cost));
  }
  switch (node.type) {
    case "string":
      return typeof node.maxLength === "number" ? 6 * node.maxLength + 2 : Infinity;
    case "number":
    case "integer":
      return 24;
    case "boolean":
      return 5;
    case "array":
      return typeof node.maxItems === "number" && isNode(node.items)
        ? 2 + node.maxItems * (cost(node.items) + 1)
        : Infinity;
    case "object": {
      if (isNode(node.patternProperties)) {
        const entries = Object.entries(node.patternProperties);
        const [pattern, value] = entries[0] ?? [];
        // The one known case: keys of body.metrics, at most 64 characters (`{0,63}` after one).
        if (entries.length !== 1 || pattern !== "^[a-z][a-z0-9_]{0,63}$" || !isNode(value)) {
          return Infinity;
        }
        if (typeof node.maxProperties !== "number") return Infinity;
        return 2 + node.maxProperties * (64 + 3 + cost(value) + 1);
      }
      if (!isNode(node.properties)) return Infinity;
      let total = 2;
      for (const [key, value] of Object.entries(node.properties)) {
        total += key.length + 3 + (isNode(value) ? cost(value) : Infinity) + 1;
      }
      return total;
    }
    default:
      return Infinity;
  }
}

const WORST_CASE: Record<(typeof KINDS)[number], number> = {
  task: 53420,
  result: 52205,
  verdict: 48606,
  plan: 39935,
  lesson: 36274,
  handoff: 33580,
  design: 26912,
  blocked: 14531,
  observation: 11059,
};

// --- CA-19 --------------------------------------------------------------------------------
const DENYLIST = new Set([
  "branch",
  "commit",
  "repo",
  "pr",
  "diff",
  "test",
  "spec",
  "patch",
  "worktree",
]);

function softwareNames(kind: string, schema: Node): string[] {
  const found: string[] = [];
  for (const { node, path } of walk(schema)) {
    if (kind === "handoff" && path.join("/").startsWith("properties/body/properties/refs")) {
      continue;
    }
    if (!Array.isArray(node.required)) continue;
    for (const name of node.required as string[]) {
      if (name.split(/[_-]/).some((token) => DENYLIST.has(token))) found.push(name);
    }
  }
  return found;
}

// --- fixtures -----------------------------------------------------------------------------
function largestValid(kind: string): { name: string; value: unknown; bytes: number } {
  const dir = join(FIXTURES, `cortex-${kind}`, "valid");
  const all = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((name) => {
      const value: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
      return { name, value, bytes: Buffer.byteLength(JSON.stringify(value)) };
    });
  return all.sort((a, b) => b.bytes - a.bytes)[0] as (typeof all)[number];
}

describe("cortex envelopes", () => {
  it("test_ca_02_registry_has_defs_and_the_nine_kinds", () => {
    const ids = registry.ids.filter((id) => id.startsWith("urn:agent-kit:cortex:")).sort();
    expect(ids).toEqual([DEFS_ID, ...KINDS.map(idOf)].sort());
    for (const kind of KINDS) expect(schemaOf(kind).$id).toBe(idOf(kind));
  });

  it("test_ca_03_root_header_of_every_envelope", () => {
    for (const kind of KINDS) {
      const s = schemaOf(kind);
      expect([...(s.required as string[])].sort(), kind).toEqual(
        ["body", "created_at", "id", "producer", "schema", "work_item"].sort(),
      );
      const props = s.properties as Record<string, Node>;
      expect(Object.keys(props).sort(), kind).toEqual(
        [
          "body",
          "correlation_id",
          "created_at",
          "id",
          "parent_id",
          "producer",
          "schema",
          "work_item",
        ].sort(),
      );
      expect(s.additionalProperties, kind).toBe(false);
      expect(props.schema?.const, kind).toBe(`cortex.${kind}/v1`);
      expect(readdirSync(join(SCHEMAS, "cortex")), kind).toContain(`${kind}.schema.json`);
    }
  });

  it("test_ca_05_no_forbidden_keywords_and_refs_point_to_definitions", () => {
    for (const kind of KINDS) {
      const s = schemaOf(kind);
      expect(bannedKeywords(s), kind).toEqual([]);
      for (const { node } of walk(s)) {
        if (node.$ref !== undefined) expect(node.$ref, kind).toMatch(REF_OK);
      }
    }
    expect(bannedKeywords(registry.schemaOf(DEFS_ID) as Node)).toEqual([]);
    // Self-test: a planted keyword is caught, a property that is merely named like one is not.
    expect(bannedKeywords({ type: "object", properties: { a: { allOf: [] } } })).toEqual([
      "properties/a:allOf",
    ]);
    expect(
      bannedKeywords({
        type: "object",
        properties: { not: { type: "string" }, if: { type: "string" } },
        required: ["not"],
      }),
    ).toEqual([]);
    // Every $ref in the repository points to the two allowed documents.
    for (const id of [COMMON_ID, DEFS_ID]) expect(registry.has(id)).toBe(true);
  });

  it("test_ca_16_every_node_is_bounded", () => {
    for (const kind of KINDS) expect(structuralProblems(schemaOf(kind)), kind).toEqual([]);
    expect(structuralProblems(registry.schemaOf(DEFS_ID) as Node)).toEqual([]);
    const metrics = (
      ((schemaOf("observation").properties as Record<string, Node>).body as Node)
        .properties as Record<string, Node>
    ).metrics as Node;
    expect(metrics.maxProperties).toBe(32);
    expect(metrics.additionalProperties).toBe(false);
    // Self-test: unbounded nodes are reported.
    const planted = structuralProblems({
      type: "object",
      properties: {
        s: { type: "string" },
        a: { type: "array", items: { type: "string", maxLength: 1 } },
        o: { type: "object" },
        n: { type: "integer", minimum: 0 },
        x: {},
      },
      additionalProperties: false,
    });
    expect(planted.length).toBe(5);
  });

  it("test_ca_17_worst_case_size_is_bounded", () => {
    for (const kind of KINDS) {
      const bytes = cost(schemaOf(kind));
      expect(bytes, kind).toBeLessThanOrEqual(65536);
      expect(bytes, kind).toBeLessThanOrEqual(WORST_CASE[kind]);
      expect(largestValid(kind).bytes, kind).toBeLessThan(65536);
    }
    // Self-test: a node without a finite bound is Infinity.
    expect(cost({ type: "string" })).toBe(Number.POSITIVE_INFINITY);
    expect(cost({ type: "array", items: { type: "boolean" } })).toBe(Number.POSITIVE_INFINITY);
    expect(cost({ type: "object", patternProperties: { "^a$": { type: "boolean" } } })).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(cost({ type: "array", items: { type: "boolean" }, maxItems: 2 })).toBe(2 + 2 * 6);
  });

  it("test_ca_19_required_names_are_domain_neutral", () => {
    for (const kind of KINDS) expect(softwareNames(kind, schemaOf(kind)), kind).toEqual([]);
    // Self-test: a planted required `commit_id` is caught; `producer` is not a false positive.
    expect(
      softwareNames("task", {
        type: "object",
        required: ["commit_id", "producer", "work-item"],
        properties: {},
      }),
    ).toEqual(["commit_id"]);
    // The optional software-flavored names live only in handoff.refs.
    const refs = (
      ((schemaOf("handoff").properties as Record<string, Node>).body as Node).properties as Record<
        string,
        Node
      >
    ).refs as Node;
    expect(Object.keys(refs.properties as Node).sort()).toEqual([
      "branch",
      "commit",
      "patch",
      "worktree",
    ]);
    expect(refs.required).toBeUndefined();
  });

  it("test_ca_21_largest_valid_fixture_validates_quickly", () => {
    const limit = process.platform === "win32" ? 80 : 20;
    for (const kind of KINDS) {
      const { value } = largestValid(kind);
      const run = () => {
        const start = performance.now();
        const result = registry.validate(idOf(kind), value);
        const elapsed = performance.now() - start;
        expect(result.valid, kind).toBe(true);
        return elapsed;
      };
      for (let i = 0; i < 3; i++) run();
      const times = Array.from({ length: 5 }, run).sort((a, b) => a - b);
      expect(times[2], kind).toBeLessThan(limit);
    }
  });
});
