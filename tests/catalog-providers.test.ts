import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/schemas/registry.js";

const ROOT = join(import.meta.dirname, "..");
const ID = "urn:agent-kit:catalog:providers:v1";
const registry = loadRegistry(join(ROOT, "schemas"));
const shipped = JSON.parse(readFileSync(join(ROOT, "catalog", "providers.json"), "utf8"));

type Node = Record<string, unknown>;
interface Provider {
  id: string;
  title: string;
  kind: string;
  command?: string;
  base_url_env?: string;
  concurrency: { recommended: number; max: number };
  tiers: Record<string, string>;
  capabilities: string[];
}
interface Catalog {
  format: string;
  global_max_agents: number;
  providers: Provider[];
}
const catalog = shipped as Catalog;
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

/** Cross-field rules of RF-10; returns one message per violation. */
function crossFieldProblems(c: Catalog): string[] {
  const problems: string[] = [];
  if (c.global_max_agents > 10) problems.push("global_max_agents above 10");
  const seen = new Set<string>();
  for (const p of c.providers) {
    if (seen.has(p.id)) problems.push(`duplicate id ${p.id}`);
    seen.add(p.id);
    if (p.concurrency.recommended > p.concurrency.max) problems.push(`${p.id}: recommended > max`);
    if (p.concurrency.max > c.global_max_agents) problems.push(`${p.id}: max > global_max_agents`);
  }
  return problems;
}

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

/** Tier values that are not empty or that name a denylisted word. */
function tierProblems(c: Catalog): string[] {
  const found: string[] = [];
  for (const p of c.providers) {
    for (const [tier, value] of Object.entries(p.tiers)) {
      if (value !== "") found.push(`${p.id}.${tier}: not empty`);
      for (const token of value.toLowerCase().split(/[^a-z0-9]+/)) {
        if (DENYLIST.has(token)) found.push(`${p.id}.${tier}: ${token}`);
      }
    }
  }
  return found;
}

function structuralProblems(node: Node, path = "(root)"): string[] {
  const problems: string[] = [];
  const fixed = Object.hasOwn(node, "const") || Object.hasOwn(node, "enum");
  if (node.type === "string" && !fixed && typeof node.maxLength !== "number") {
    problems.push(`${path}: string without maxLength`);
  }
  if (node.type === "array" && typeof node.maxItems !== "number") {
    problems.push(`${path}: array without maxItems`);
  }
  if (node.type === "object" && node.additionalProperties !== false) {
    problems.push(`${path}: object without additionalProperties false`);
  }
  if (
    (node.type === "number" || node.type === "integer") &&
    (typeof node.minimum !== "number" || typeof node.maximum !== "number")
  ) {
    problems.push(`${path}: number without minimum and maximum`);
  }
  for (const key of ["$defs", "properties"]) {
    const map = node[key];
    if (!isNode(map)) continue;
    for (const [name, child] of Object.entries(map)) {
      if (isNode(child)) problems.push(...structuralProblems(child, `${path}/${key}/${name}`));
    }
  }
  if (isNode(node.items)) problems.push(...structuralProblems(node.items, `${path}/items`));
  for (const key of ["oneOf", "anyOf"]) {
    const list = node[key];
    if (Array.isArray(list)) {
      list.forEach((child, i) => {
        if (isNode(child)) problems.push(...structuralProblems(child, `${path}/${key}/${i}`));
      });
    }
  }
  return problems;
}

const clone = (): Catalog => structuredClone(catalog);
function at(c: Catalog, i: number): Provider {
  const p = c.providers[i];
  if (!p) throw new Error(`no provider ${i}`);
  return p;
}

describe("providers catalog", () => {
  it("test_ca_07_has_the_expected_providers", () => {
    expect(catalog.format).toBe("agent-kit-providers/v1");
    expect(catalog.global_max_agents).toBe(10);
    const summary = catalog.providers.map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      target: p.command ?? p.base_url_env,
      recommended: p.concurrency.recommended,
      max: p.concurrency.max,
      capabilities: p.capabilities,
    }));
    const all = ["read", "search", "edit", "shell", "web", "mcp"];
    expect(summary).toEqual([
      {
        id: "claude-code",
        title: "Claude Code",
        kind: "cli",
        target: "claude",
        recommended: 2,
        max: 4,
        capabilities: all,
      },
      {
        id: "codex",
        title: "Codex CLI",
        kind: "cli",
        target: "codex",
        recommended: 1,
        max: 2,
        capabilities: all,
      },
      {
        id: "antigravity",
        title: "Antigravity",
        kind: "cli",
        target: "agy",
        recommended: 2,
        max: 4,
        capabilities: all,
      },
      {
        id: "openai-compatible",
        title: "OpenAI-compatible endpoint",
        kind: "endpoint",
        target: "CORTEX_OPENAI_BASE_URL",
        recommended: 1,
        max: 2,
        capabilities: [],
      },
    ]);
  });

  it("test_ca_08_schema_is_registered_and_validates_the_file", () => {
    expect(registry.has(ID)).toBe(true);
    expect(registry.validate(ID, shipped)).toEqual({ valid: true });
    const noCommand = clone();
    delete noCommand.providers[0]?.command;
    expect(registry.validate(ID, noCommand).valid).toBe(false);
    const noEnv = clone();
    delete noEnv.providers[3]?.base_url_env;
    expect(registry.validate(ID, noEnv).valid).toBe(false);
    const both = clone();
    at(both, 0).base_url_env = "SOME_URL";
    expect(registry.validate(ID, both).valid).toBe(false);
  });

  it("test_ca_09_tiers_are_empty_and_name_no_model", () => {
    expect(tierProblems(catalog)).toEqual([]);
    for (const p of catalog.providers) {
      expect(Object.keys(p.tiers).sort(), p.id).toEqual(["deep", "fast", "standard"]);
    }
    // Self-test: a planted model name is caught.
    const planted = clone();
    at(planted, 0).tiers.deep = "Opus";
    expect(tierProblems(planted).length).toBeGreaterThan(0);
    at(planted, 0).tiers.deep = "";
    at(planted, 1).tiers.fast = "gpt-4";
    expect(tierProblems(planted).join("\n")).toMatch(/gpt/);
  });

  it("test_ca_10_cross_field_rules", () => {
    expect(crossFieldProblems(catalog)).toEqual([]);
    const recommended = clone();
    at(recommended, 0).concurrency = { recommended: 5, max: 4 };
    expect(crossFieldProblems(recommended)).toEqual(["claude-code: recommended > max"]);
    const max = clone();
    max.global_max_agents = 3;
    expect(crossFieldProblems(max).join("\n")).toMatch(/claude-code: max > global_max_agents/);
    const dup = clone();
    at(dup, 1).id = "claude-code";
    expect(crossFieldProblems(dup).join("\n")).toMatch(/duplicate id claude-code/);
    const eleven = clone();
    eleven.global_max_agents = 11;
    expect(crossFieldProblems(eleven).join("\n")).toMatch(/above 10/);
  });

  it("test_ca_14_schema_nodes_are_bounded", () => {
    const schema = registry.schemaOf(ID) as Node;
    expect(structuralProblems(schema)).toEqual([]);
    for (const p of catalog.providers) {
      if (p.base_url_env !== undefined) {
        expect(p.base_url_env, p.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(p.base_url_env, p.id).not.toMatch(/:\/\/|\./);
      }
    }
    // Self-test: unbounded nodes are reported.
    const planted = structuralProblems({
      type: "object",
      properties: {
        s: { type: "string" },
        a: { type: "array", items: { type: "string", maxLength: 1 } },
        o: { type: "object" },
        n: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    });
    expect(planted.length).toBe(4);
  });
});
