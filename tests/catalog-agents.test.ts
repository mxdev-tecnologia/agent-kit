import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/schemas/frontmatter.js";
import { loadRegistry } from "../src/schemas/registry.js";

const ROOT = join(import.meta.dirname, "..");
const AGENTS_DIR = join(ROOT, "catalog", "agents");
const AGENT_SCHEMA = "urn:agent-kit:frontmatter:agent:v1";
const registry = loadRegistry(join(ROOT, "schemas"));

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
];

/** id -> [title, tier, capabilities]; the source of truth is the Design of spec-05. */
const EXPECTED: Record<string, [string, string, string[]]> = {
  orchestrator: ["Delivery Orchestrator", "standard", ["read", "search"]],
  scout: ["Codebase Reconnaissance Analyst", "fast", ["read", "search"]],
  planner: ["Technical Planner", "standard", ["read", "search"]],
  architect: ["Software Architect", "deep", ["read", "search", "web"]],
  builder: ["Software Engineer", "standard", ["read", "search", "edit", "shell"]],
  verifier: ["Quality Assurance Engineer", "standard", ["read", "search", "shell"]],
  reviewer: ["Code and Spec Reviewer", "deep", ["read", "search"]],
  "ui-designer": ["UX/UI Specialist", "standard", ["read", "search", "edit", "web"]],
  "doc-writer": ["Technical Writer", "standard", ["read", "search", "edit"]],
  runner: ["Build and Test Operator", "fast", ["read", "shell"]],
  security: ["Application Security Engineer", "deep", ["read", "search"]],
  releaser: ["Release Manager", "standard", ["read", "search", "edit", "shell"]],
  observer: ["Run Observability Analyst", "fast", ["read", "search"]],
};
const VERIFIERS = ["verifier", "reviewer", "security"];
const IDS = Object.keys(EXPECTED);

// Same values as the frozen collision list of spec-03 (src/catalog/collisions.ts).
const COLLISIONS = new Set([
  ..."add-dir agents bug clear compact config context cost doctor export help hooks ide init install-github-app login logout mcp memory model output-style permissions plugin pr-comments privacy-settings release-notes resume review rewind security-review status statusline terminal-setup todos upgrade usage vim".split(
    " ",
  ),
  ..."approvals compact diff exit init logout mcp mention model new prompts quit review status undo".split(
    " ",
  ),
  ..."help init memory review status start remember".split(" "),
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

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

/** Denylisted whole words (case-insensitive, tokens split on non-alphanumerics). */
function denylisted(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => DENYLIST.has(token));
}

interface Agent {
  id: string;
  raw: string;
  data: Record<string, unknown>;
  body: string;
}

function load(id: string): Agent {
  const raw = readFileSync(join(AGENTS_DIR, `${id}.md`), "utf8");
  const parsed = parseFrontmatter(raw);
  if (!parsed.ok) throw new Error(`${id}: ${parsed.error}`);
  return { id, raw, data: parsed.data, body: parsed.body };
}

const agents = IDS.map(load);

/** Level-2 headings in order, with the text under each one. */
function sections(body: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  for (const line of body.split("\n")) {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) out.push({ heading: m[1] ?? "", text: "" });
    else if (out.length > 0) (out[out.length - 1] as { text: string }).text += `${line}\n`;
  }
  return out;
}

const sentences = (text: string) => text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim() !== "");

describe("catalog agents", () => {
  it("test_ca_01_has_exactly_the_thirteen_agents", () => {
    const files = readdirSync(AGENTS_DIR)
      .filter((f) => f !== ".gitkeep")
      .sort();
    expect(files).toEqual(IDS.map((id) => `${id}.md`).sort());
    expect(files.length).toBe(13);
  });

  it("test_ca_02_frontmatter_is_valid_and_named_after_the_file", () => {
    for (const a of agents) {
      expect(registry.validate(AGENT_SCHEMA, a.data), a.id).toEqual({ valid: true });
      expect(a.data.name, a.id).toBe(a.id);
      expect(a.data.format, a.id).toBe("agent-kit/v1");
      expect(Array.isArray(a.data.emits), a.id).toBe(true);
      expect((a.data.emits as string[]).length, a.id).toBeGreaterThan(0);
    }
  });

  it("test_ca_03_titles_and_tiers_match_the_design", () => {
    for (const a of agents) {
      const [title, tier, caps] = EXPECTED[a.id] as [string, string, string[]];
      expect(a.data.title, a.id).toBe(title);
      expect(a.data.tier, a.id).toBe(tier);
      expect(a.data.capabilities, a.id).toEqual(caps);
    }
    expect(load("ui-designer").data.title).toBe("UX/UI Specialist");
  });

  it("test_ca_04_only_the_three_verifiers_validate_and_none_can_edit", () => {
    for (const a of agents) {
      const isVerifier = VERIFIERS.includes(a.id);
      expect(a.data.verifier === true, a.id).toBe(isVerifier);
      if (isVerifier) expect(a.data.capabilities as string[], a.id).not.toContain("edit");
    }
  });

  it("test_ca_05_emits_known_envelopes_and_verifiers_emit_a_verdict", () => {
    for (const a of agents) {
      const emits = a.data.emits as string[];
      for (const ref of emits) {
        const m = /^cortex\.([a-z]+)\/v1$/.exec(ref);
        expect(m, `${a.id}: ${ref}`).not.toBeNull();
        expect(KINDS, `${a.id}: ${ref}`).toContain(m?.[1]);
      }
      expect(new Set(emits).size, a.id).toBe(emits.length);
      if (a.data.verifier === true) expect(emits, a.id).toContain("cortex.verdict/v1");
    }
  });

  it("test_ca_06_body_sections_in_order_and_short_backstory", () => {
    const order = ["Role", "Goal", "Backstory", "Operating rules", "Expected output"];
    for (const a of agents) {
      const found = sections(a.body);
      expect(
        found.map((s) => s.heading),
        a.id,
      ).toEqual(order);
      for (const s of found)
        expect(s.text.trim().length, `${a.id} ${s.heading}`).toBeGreaterThan(0);
      const backstory = found[2]?.text ?? "";
      expect(sentences(backstory).length, a.id).toBeLessThanOrEqual(3);
    }
    // Self-test: four sentences are counted as four.
    expect(sentences("One. Two! Three? Four.").length).toBe(4);
  });

  it("test_ca_13_agents_name_no_model_or_vendor", () => {
    for (const a of agents) expect(denylisted(a.raw), a.id).toEqual([]);
    // Self-test: planted names are caught, case-insensitive and as whole words only.
    expect(denylisted("Use Claude here")).toEqual(["claude"]);
    expect(denylisted("a gpt-4 call")).toEqual(["gpt"]);
    expect(denylisted("the CODEX cli")).toEqual(["codex"]);
    expect(denylisted("googleapis and lamas")).toEqual([]);
  });

  it("test_ca_15_each_file_has_at_most_120_lines", () => {
    for (const a of agents) {
      expect(a.raw.split("\n").length, a.id).toBeLessThanOrEqual(120);
    }
  });

  it("test_ca_17_no_agent_id_collides_with_a_native_command", () => {
    for (const id of IDS) expect(COLLISIONS.has(id), id).toBe(false);
    // Self-test: the constant does catch a collision.
    expect(COLLISIONS.has("review")).toBe(true);
    expect(COLLISIONS.has("con")).toBe(true);
  });
});
