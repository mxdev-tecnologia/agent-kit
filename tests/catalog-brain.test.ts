import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/schemas/frontmatter.js";
import { loadRegistry } from "../src/schemas/registry.js";

const ROOT = join(import.meta.dirname, "..");
const CATALOG = join(ROOT, "catalog");
const registry = loadRegistry(join(ROOT, "schemas"));

const WORKFLOWS = [
  "triage",
  "spec",
  "design",
  "tasks",
  "build",
  "verify",
  "ship",
  "sync",
  "ui-lanes",
  "debug",
  "critique",
  "learn",
  "progress",
];
const SKILLS = [
  "ears-requirements",
  "acceptance-criteria",
  "task-breakdown",
  "traceability",
  "verification-evidence",
  "context-budget",
  "git-flow",
  "security-audit",
  "project-memory",
  "design-lanes",
];
const RULES = [
  "language",
  "scope-discipline",
  "human-in-the-loop",
  "no-secrets",
  "evidence-before-done",
  "commit-format",
];
const AGENT_IDS = [
  "orchestrator",
  "scout",
  "planner",
  "architect",
  "builder",
  "verifier",
  "reviewer",
  "ui-designer",
  "doc-writer",
  "runner",
  "security",
  "releaser",
  "observer",
];
const ENVELOPES = [
  "blocked",
  "design",
  "handoff",
  "lesson",
  "observation",
  "plan",
  "result",
  "task",
  "verdict",
];
const SECTIONS = ["Objective", "Inputs", "Steps", "Outputs", "Human stops"];
const COMMIT_TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "build",
  "ci",
  "chore",
  "security",
];
const DENYLIST = [
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
];
// Frozen copy of the collision lists of spec-03 (native commands per CLI).
const COLLISIONS: Record<string, string[]> = {
  claude: [
    "add-dir",
    "agents",
    "bug",
    "clear",
    "compact",
    "config",
    "context",
    "cost",
    "doctor",
    "export",
    "help",
    "hooks",
    "ide",
    "init",
    "install-github-app",
    "login",
    "logout",
    "mcp",
    "memory",
    "model",
    "output-style",
    "permissions",
    "plugin",
    "pr-comments",
    "privacy-settings",
    "release-notes",
    "resume",
    "review",
    "rewind",
    "security-review",
    "status",
    "statusline",
    "terminal-setup",
    "todos",
    "upgrade",
    "usage",
    "vim",
  ],
  codex: [
    "approvals",
    "compact",
    "diff",
    "exit",
    "init",
    "logout",
    "mcp",
    "mention",
    "model",
    "new",
    "prompts",
    "quit",
    "review",
    "status",
    "undo",
  ],
  antigravity: ["help", "init", "memory", "review", "status", "start", "remember"],
};
const RESERVED = [
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
];

const read = (path: string) => readFileSync(path, "utf8");
const names = (dir: string, suffix = "") =>
  readdirSync(join(CATALOG, dir))
    .filter((n) => n !== ".gitkeep" && n.endsWith(suffix))
    .map((n) => n.slice(0, n.length - suffix.length))
    .sort();
const sorted = (list: string[]) => [...list].sort();

function frontmatterOf(path: string) {
  const parsed = parseFrontmatter(read(path));
  if (!parsed.ok) throw new Error(`${path}: ${parsed.error}`);
  return parsed;
}

function headings(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3).trim());
}

function section(body: string, title: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (entry.name !== ".gitkeep") out.push(full);
  }
  return out;
}

function denylisted(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return DENYLIST.filter((w) => words.includes(w));
}

describe("workflows", () => {
  it("test_ca_01_exactly_thirteen_workflows", () => {
    expect(names("workflows", ".md")).toEqual(sorted(WORKFLOWS));
  });

  it("test_ca_02_sections_in_order", () => {
    for (const name of WORKFLOWS) {
      const { body } = frontmatterOf(join(CATALOG, "workflows", `${name}.md`));
      const found = headings(body);
      expect(found, name).toEqual(SECTIONS);
    }
  });

  it("test_ca_03_frontmatter_valid_with_known_agents", () => {
    for (const name of WORKFLOWS) {
      const { data } = frontmatterOf(join(CATALOG, "workflows", `${name}.md`));
      const result = registry.validate("urn:agent-kit:frontmatter:workflow:v1", data);
      expect(result.valid, name).toBe(true);
      expect(data.name).toBe(name);
      expect(data.format).toBe("agent-kit/v1");
      expect(typeof data["argument-hint"], name).toBe("string");
      const agents = data.agents as string[];
      expect(Array.isArray(agents), name).toBe(true);
      expect(agents.length, name).toBeGreaterThanOrEqual(1);
      for (const agent of agents) expect(AGENT_IDS, `${name}: ${agent}`).toContain(agent);
    }
  });

  it("test_ca_04_envelope_kinds_are_known", () => {
    const needs = ["build", "verify", "tasks", "design", "learn"];
    for (const name of WORKFLOWS) {
      const { body } = frontmatterOf(join(CATALOG, "workflows", `${name}.md`));
      const kinds = [...body.matchAll(/cortex\.([a-z]+)\/v1/g)].map((m) => m[1] ?? "");
      for (const kind of kinds) expect(ENVELOPES, `${name}: ${kind}`).toContain(kind);
      if (needs.includes(name)) expect(kinds.length, name).toBeGreaterThan(0);
    }
  });

  it("test_ca_05_human_stops_not_empty", () => {
    for (const name of WORKFLOWS) {
      const { body } = frontmatterOf(join(CATALOG, "workflows", `${name}.md`));
      const items = section(body, "Human stops")
        .split("\n")
        .filter((l) => l.startsWith("- "));
      expect(items.length, name).toBeGreaterThanOrEqual(1);
    }
  });

  it("test_ca_18_workflows_have_at_most_150_lines", () => {
    for (const name of WORKFLOWS) {
      const lines = read(join(CATALOG, "workflows", `${name}.md`)).split("\n").length;
      expect(lines, name).toBeLessThanOrEqual(150);
    }
  });
});

describe("skills", () => {
  it("test_ca_08_exactly_ten_skills_with_skill_md", () => {
    expect(names("skills")).toEqual(sorted(SKILLS));
    for (const name of SKILLS) {
      expect(existsSync(join(CATALOG, "skills", name, "SKILL.md")), name).toBe(true);
    }
  });

  it("test_ca_09_skill_frontmatter_valid", () => {
    for (const name of SKILLS) {
      const { data } = frontmatterOf(join(CATALOG, "skills", name, "SKILL.md"));
      expect(registry.validate("urn:agent-kit:frontmatter:skill:v1", data).valid, name).toBe(true);
      expect(data.name).toBe(name);
      expect(String(data.description).length, name).toBeGreaterThan(0);
    }
  });

  it("test_ca_10_every_reference_is_linked", () => {
    for (const name of SKILLS) {
      const refs = join(CATALOG, "skills", name, "references");
      if (!existsSync(refs)) continue;
      const text = read(join(CATALOG, "skills", name, "SKILL.md"));
      for (const file of readdirSync(refs)) {
        expect(text, `${name}: ${file}`).toContain(`(references/${file})`);
      }
    }
  });

  it("test_ca_17_skill_size_limits", () => {
    for (const name of SKILLS) {
      const path = join(CATALOG, "skills", name, "SKILL.md");
      expect(read(path).split("\n").length, name).toBeLessThanOrEqual(500);
      expect(String(frontmatterOf(path).data.description).length, name).toBeLessThanOrEqual(1024);
    }
  });
});

describe("rules", () => {
  it("test_ca_11_exactly_six_valid_rules", () => {
    expect(names("rules", ".md")).toEqual(sorted(RULES));
    for (const name of RULES) {
      const { data } = frontmatterOf(join(CATALOG, "rules", `${name}.md`));
      expect(registry.validate("urn:agent-kit:frontmatter:rule:v1", data).valid, name).toBe(true);
      expect(data.name).toBe(name);
      expect(data.always).toBe(true);
    }
  });

  it("test_ca_12_commit_format_rule_content", () => {
    const { body } = frontmatterOf(join(CATALOG, "rules", "commit-format.md"));
    expect(body).toContain("<type>(<scope>): <description>");
    for (const type of COMMIT_TYPES) expect(body).toContain(`\`${type}\``);
    expect(body).toContain("^[a-z0-9]+(-[a-z0-9]+)*$");
  });
});

describe("spec example (Spec format)", () => {
  const example = read(
    join(CATALOG, "skills", "ears-requirements", "references", "spec-example.md"),
  );
  const lines = example.split("\n");

  function family(prefix: string): { id: string; text: string }[] {
    const re = new RegExp(`^- \\*\\*${prefix}-(\\d{2,})(?: \\([^)]*\\))?:?\\*\\*:?\\s*(.*)$`);
    return lines.flatMap((l) => {
      const m = re.exec(l);
      return m ? [{ id: m[1] ?? "", text: m[2] ?? "" }] : [];
    });
  }

  const sequential = (ids: string[]) =>
    ids.every((id, i) => Number(id) === i + 1) && new Set(ids).size === ids.length;

  it("test_ca_06_example_follows_the_spec_format", () => {
    const firstH2 = lines.findIndex((l) => l.startsWith("## "));
    const header = lines.slice(0, firstH2);
    expect(header.some((l) => /^- \*\*Status:\*\* \S/.test(l))).toBe(true);

    const h2 = headings(example);
    for (const title of [
      "Functional requirements",
      "Non-functional requirements",
      "Acceptance criteria",
      "Traceability matrix",
    ]) {
      expect(h2).toContain(title);
    }

    const rf = family("RF");
    const rnf = family("RNF");
    expect(rf.length).toBeGreaterThan(0);
    expect(rnf.length).toBeGreaterThan(0);
    expect(sequential(rf.map((r) => r.id))).toBe(true);
    expect(sequential(rnf.map((r) => r.id))).toBe(true);
    for (const req of rf) {
      expect(req.text).toMatch(/^(THE |WHEN |WHILE |IF |WHERE )/);
      expect(req.text).toMatch(/\bSHALL\b/);
    }

    const caRe =
      /^- \*\*CA-(\d{2,})\*\* \(([^)]*)\) — \*\*Given\*\* .+ \*\*When\*\* .+ \*\*Then\*\* .+/;
    const cas = lines.flatMap((l) => {
      const m = caRe.exec(l);
      return m ? [{ id: m[1] ?? "", covers: (m[2] ?? "").split(",").map((s) => s.trim()) }] : [];
    });
    expect(cas.length).toBeGreaterThan(0);
    expect(sequential(cas.map((c) => c.id))).toBe(true);
    const known = new Set([...rf.map((r) => `RF-${r.id}`), ...rnf.map((r) => `RNF-${r.id}`)]);
    for (const c of cas) for (const ref of c.covers) expect(known.has(ref), ref).toBe(true);

    const rows = section(example, "Traceability matrix")
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .map((l) => l.split("|").map((c) => c.trim()))
      .filter((cells) => /^(RF|RNF)-\d{2,}$/.test(cells[1] ?? ""));
    const caIds = new Set(cas.map((c) => `CA-${c.id}`));
    expect(rows.map((r) => r[1]).sort()).toEqual([...known].sort());
    for (const row of rows) {
      const ids = (row[2] ?? "").split(",").map((s) => s.trim());
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(caIds.has(id), id).toBe(true);
    }
  });

  it("test_ca_06_spec_workflow_states_the_format", () => {
    const { body } = frontmatterOf(join(CATALOG, "workflows", "spec.md"));
    for (const title of [
      "Functional requirements",
      "Non-functional requirements",
      "Acceptance criteria",
      "Traceability matrix",
    ]) {
      expect(body).toContain(title);
    }
    expect(body).toContain("- **Status:**");
  });
});

describe("neutrality and names", () => {
  const dirs = ["skills", "workflows", "rules"].map((d) => join(CATALOG, d));

  it("test_ca_14_no_denylisted_word", () => {
    for (const dir of dirs) {
      for (const file of filesUnder(dir)) {
        expect(denylisted(read(file)), file).toEqual([]);
      }
    }
  });

  it("test_ca_14_self_test_catches_a_planted_word", () => {
    expect(denylisted("a plain sentence")).toEqual([]);
    expect(denylisted("uses Claude here")).toEqual(["claude"]);
    expect(denylisted("model gpt-4 value")).toEqual(["gpt"]);
  });

  it("test_ca_15_names_do_not_repeat_or_collide", () => {
    const all = [...WORKFLOWS, ...SKILLS, ...RULES];
    expect(new Set(all).size).toBe(all.length);
    const forbidden = new Set([...Object.values(COLLISIONS).flat(), ...RESERVED]);
    for (const name of all) expect(forbidden.has(name), name).toBe(false);
    // The names on disk are the ones checked above.
    expect(
      sorted([...names("workflows", ".md"), ...names("skills"), ...names("rules", ".md")]),
    ).toEqual(sorted(all));
  });
});
