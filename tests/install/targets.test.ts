import { afterEach, describe, expect, it } from "vitest";
import { claudeTools } from "../../src/install/targets.js";
import {
  agentMd,
  cleanup,
  doInit,
  exists,
  listFiles,
  makePackage,
  makeProject,
  put,
  read,
  ruleMd,
  snapshot,
  workflowMd,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("targets", () => {
  it("test_ca_07_shared_files", () => {
    const pkg = makePackage({ providers: true });
    const root = makeProject();
    expect(doInit(root, pkg, { cli: "antigravity" }).code).toBe(0);
    for (const p of [
      ".agents/skills/planning/SKILL.md",
      ".agents/skills/planning/references/guide.md",
      ".agents/skills/planning/scripts/run.sh",
      ".agents/agents/reviewer.md",
      ".agents/rules/style.md",
      ".agents/workflows/ship.md",
      ".agents/providers.json",
      ".agents/schemas/common.schema.json",
      "AGENTS.md",
    ]) {
      expect(exists(root, p), p).toBe(true);
    }
    const other = makeProject();
    doInit(other, makePackage(), { cli: "antigravity" });
    expect(exists(other, ".agents/providers.json")).toBe(false);
  });

  it("test_ca_09_block_index_inline_and_scoped_rules", () => {
    const pkg = makePackage();
    const root = makeProject();
    doInit(root, pkg, { cli: "codex" });
    const text = read(root, "AGENTS.md");
    expect(text).toContain("`planning`");
    expect(text).toContain(".agents/skills/planning/SKILL.md");
    expect(text).toContain(".agents/workflows/ship.md");
    expect(text).toContain(".agents/agents/reviewer.md");
    expect(text).toContain("Rule style body.");
    expect(text).toContain("`src/**/*.ts`");
    expect(text).toContain(".agents/rules/ts-style.md");
    expect(text).not.toContain("Scoped body.");
  });

  it("test_ca_11_claude_targets", () => {
    const pkg = makePackage();
    const root = makeProject();
    doInit(root, pkg, { cli: "claude" });
    expect(read(root, "CLAUDE.md")).toContain("@AGENTS.md");
    const skill = read(root, ".claude/skills/planning/SKILL.md");
    expect(skill).toBe('---\nname: planning\ndescription: "Skill planning."\n---\nSkill body.\n');
    expect(exists(root, ".claude/skills/planning/references/guide.md")).toBe(true);
    expect(exists(root, ".claude/skills/planning/scripts/run.sh")).toBe(true);
    const cmd = read(root, ".claude/commands/ship.md");
    expect(cmd).toContain('description: "Workflow ship."');
    expect(cmd).toContain('argument-hint: "[scope]"');
    expect(cmd).toContain("Run the ship workflow.");
  });

  it("test_ca_12_claude_tools_mapping", () => {
    expect(claudeTools(["read"])).toEqual(["Read", "Grep", "Glob"]);
    expect(claudeTools(["search"])).toEqual(["Grep", "Glob"]);
    expect(claudeTools(["edit"])).toEqual(["Edit", "Write"]);
    expect(claudeTools(["shell"])).toEqual(["Bash"]);
    expect(claudeTools(["web"])).toEqual(["WebFetch", "WebSearch"]);
    expect(claudeTools(["mcp"])).toEqual(["Read", "Grep", "Glob"]);
    expect(claudeTools(["shell", "edit", "read", "search"])).toEqual([
      "Read",
      "Grep",
      "Glob",
      "Edit",
      "Write",
      "Bash",
    ]);
    const pkg = makePackage();
    put(pkg, "catalog/agents/ro.md", agentMd("ro", ["read", "search", "mcp"]));
    put(pkg, "catalog/agents/only-mcp.md", agentMd("only-mcp", ["mcp"]));
    put(pkg, "catalog/agents/dev.md", agentMd("dev", ["edit", "shell", "mcp"]));
    const root = makeProject();
    doInit(root, pkg, { cli: "claude" });
    const ro = read(root, ".claude/agents/ro.md");
    expect(ro).toContain("tools: Read, Grep, Glob\n");
    expect(ro).not.toMatch(/Edit|Write|Bash/);
    expect(read(root, ".claude/agents/only-mcp.md")).toContain("tools: Read, Grep, Glob\n");
    expect(read(root, ".claude/agents/dev.md")).toContain("tools: Edit, Write, Bash\n");
    for (const f of listFiles(root).filter((p) => p.startsWith(".claude/agents/"))) {
      expect(read(root, f)).toMatch(/^tools: /m);
      expect(read(root, f)).not.toMatch(/^model:/m);
    }
  });

  it("test_ca_13_codex_workflow_as_skill_and_antigravity_nothing_extra", () => {
    const pkg = makePackage();
    const root = makeProject();
    doInit(root, pkg, { cli: "codex" });
    expect(read(root, ".agents/skills/ship/SKILL.md")).toBe(
      '---\nname: ship\ndescription: "Workflow ship."\n---\nRun the ship workflow.\n',
    );
    const ag = makeProject();
    doInit(ag, pkg, { cli: "antigravity" });
    expect(exists(ag, ".agents/skills/ship")).toBe(false);
    expect(exists(ag, ".claude")).toBe(false);
    expect(exists(ag, "CLAUDE.md")).toBe(false);
    expect(exists(ag, ".codex")).toBe(false);
  });

  it("test_ca_42_block_size_limit", () => {
    const sizeOf = (bodyLen: number) => {
      const pkg = makePackage();
      put(pkg, "catalog/rules/big.md", ruleMd("big", "always: true", "a".repeat(bodyLen)));
      const root = makeProject();
      const r = doInit(root, pkg, { cli: "antigravity" });
      return { r, root };
    };
    const probe = sizeOf(1000);
    const text = read(probe.root, "AGENTS.md");
    const block = text.slice(
      "<!-- agent-kit:begin -->\n".length,
      text.indexOf("\n<!-- agent-kit:end -->"),
    );
    const exact = 1000 + (24 * 1024 - Buffer.byteLength(block));
    expect(sizeOf(exact).r.code).toBe(0);
    const over = sizeOf(exact + 1);
    expect(over.r.code).toBe(1);
    expect(over.r.err).toContain("AGENTS.md");
    expect(over.r.err).toMatch(/\d+ bytes/);
    expect(snapshot(over.root)).toEqual({});
  });

  it("test_ca_09_workflow_namespace_shared_with_skills", () => {
    const pkg = makePackage();
    put(pkg, "catalog/workflows/planning.md", workflowMd("planning"));
    const r = doInit(makeProject(), pkg, { cli: "codex" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("planning");
  });
});
