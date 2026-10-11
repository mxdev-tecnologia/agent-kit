import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { checkSelfReport } from "../src/commands/check-self.js";

const FILES = ["README.md", "LICENSE", "AGENTS.md", "CLAUDE.md", "CHANGELOG.md"];
const DIRS = ["catalog/agents", "catalog/skills", "catalog/workflows", "catalog/rules", "schemas"];
const tmp: string[] = [];

function makeRoot(opts: { complete: boolean; versionFile?: string }): string {
  const root = mkdtempSync(join(tmpdir(), "agent-kit-"));
  tmp.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
  writeFileSync(join(root, "VERSION"), opts.versionFile ?? "1.2.3\n");
  if (opts.complete) {
    for (const f of FILES) writeFileSync(join(root, f), "x");
    for (const d of DIRS) mkdirSync(join(root, ...d.split("/")), { recursive: true });
  }
  return root;
}

function run(args: string[]) {
  let out = "";
  let err = "";
  const code = main(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

afterEach(() => {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("check --self", () => {
  it("test_ca_04_valid_root_passes", () => {
    const root = makeRoot({ complete: true });
    const r = run(["check", "--self", "--root", root]);
    expect(r.out).toContain("OK");
    expect(r.code).toBe(0);
  });

  it("test_ca_05_lists_every_failure", () => {
    const root = makeRoot({ complete: false, versionFile: "9.9.9" });
    const r = run(["check", "--self", "--root", root]);
    const lines = r.err.trim().split("\n");
    expect(r.code).toBe(1);
    expect(lines).toHaveLength(FILES.length + DIRS.length + 1);
    for (const f of FILES) expect(r.err).toContain(f);
    for (const d of DIRS) expect(r.err).toContain(d);
    expect(r.err).toContain("VERSION mismatch");
  });

  it("test_ca_06_root_option_overrides_cwd", () => {
    // Two temp roots, one invalid and one valid: --root decides which one is checked.
    const invalid = makeRoot({ complete: false });
    const valid = makeRoot({ complete: true });
    expect(run(["check", "--self", "--root", invalid]).code).toBe(1);
    expect(run(["check", "--self", "--root", valid]).code).toBe(0);
  });
});

const REPO_ROOT = join(import.meta.dirname, "..");

/** A valid root whose `schemas/` is a copy of the repository schemas. */
function rootWithSchemas(): string {
  const root = makeRoot({ complete: true });
  cpSync(join(REPO_ROOT, "schemas"), join(root, "schemas"), { recursive: true });
  return root;
}

function put(root: string, rel: string, content: string): void {
  const path = join(root, ...rel.split("/"));
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

const fm = (lines: string[]) => `---\n${lines.join("\n")}\n---\nBody text.\n`;
const BASE = ["format: agent-kit/v1", "description: A short description."];
const agent = (name: string) =>
  fm([...BASE, `name: ${name}`, "title: Reviewer", "capabilities: [read]", "tier: fast"]);
const plain = (name: string) => fm([...BASE, `name: ${name}`]);

function catalog(root: string): void {
  put(root, "catalog/agents/reviewer.md", agent("reviewer"));
  put(root, "catalog/workflows/ship.md", plain("ship"));
  put(root, "catalog/rules/style.md", plain("style"));
  put(root, "catalog/skills/planning/SKILL.md", plain("planning"));
}

describe("check --self: schemas", () => {
  it("test_ca_22_invalid_schema_is_a_failure_with_its_path", () => {
    const root = rootWithSchemas();
    put(
      root,
      "schemas/broken.schema.json",
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "urn:agent-kit:broken:v1",
        allOf: [],
      }),
    );
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("broken.schema.json");
    expect(r.err).toContain("/allOf");
    expect(r.err.trim().split("\n")).toHaveLength(1);
  });

  it("test_ca_22_repository_schemas_load", () => {
    const r = run(["check", "--self", "--root", REPO_ROOT]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
  });

  it("test_ca_22_schemas_come_from_the_root_not_the_package", () => {
    // A root with no frontmatter schema must fail its catalog even though the package has them.
    const root = makeRoot({ complete: true });
    put(root, "catalog/rules/style.md", plain("style"));
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("catalog/rules/style.md");
  });
});

describe("check --self: catalog", () => {
  it("test_ca_23_valid_catalog_passes", () => {
    const root = rootWithSchemas();
    catalog(root);
    for (const d of ["agents", "workflows", "rules", "skills"])
      put(root, `catalog/${d}/.gitkeep`, "");
    const r = run(["check", "--self", "--root", root]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(checkSelfReport(root).catalogFiles).toBe(4);
  });

  it("test_ca_23_invalid_files_are_listed_with_path_line_and_errors", () => {
    const root = rootWithSchemas();
    catalog(root);
    put(root, "catalog/agents/broken.md", "---\nname: broken\nthis is not yaml\n---\n");
    put(root, "catalog/rules/wrong.md", fm(["format: agent-kit/v1", "name: wrong"]));
    put(root, "catalog/workflows/nofm.md", "# no frontmatter\n");
    mkdirSync(join(root, "catalog", "skills", "empty-skill"), { recursive: true });
    put(root, "catalog/agents/.gitkeep", "");
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    const lines = r.err.trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(r.err).toMatch(/catalog\/agents\/broken\.md: line 3:/);
    expect(r.err).toMatch(
      /catalog\/rules\/wrong\.md: invalid rule frontmatter: .*description.*\[required\]/,
    );
    expect(r.err).toMatch(/catalog\/workflows\/nofm\.md: line 1:/);
    expect(r.err).toMatch(/catalog\/skills\/empty-skill.*SKILL\.md/);
    expect(r.err).not.toContain(".gitkeep");
    expect(r.err).not.toContain("reviewer.md");
  });

  it("test_ca_24_names_must_match_files_folders_and_not_collide", () => {
    const root = rootWithSchemas();
    put(root, "catalog/agents/foo.md", agent("bar"));
    put(root, "catalog/skills/folder-name/SKILL.md", plain("other-name"));
    put(root, "catalog/skills/shared/SKILL.md", plain("shared"));
    put(root, "catalog/workflows/shared.md", plain("shared"));
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/catalog\/agents\/foo\.md: name "bar" must equal "foo"/);
    expect(r.err).toMatch(/folder-name\/SKILL\.md: name "other-name" must equal "folder-name"/);
    expect(r.err).toMatch(
      /catalog\/skills\/shared\/SKILL\.md: name "shared" is also used by catalog\/workflows\/shared\.md/,
    );
    expect(r.err.trim().split("\n")).toHaveLength(3);
  });

  it("test_ca_25_broken_registry_fails_every_catalog_file", () => {
    const root = rootWithSchemas();
    catalog(root);
    put(root, "schemas/broken.schema.json", "{ not json");
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    const lines = r.err.trim().split("\n");
    expect(lines).toHaveLength(1 + 4);
    for (const f of [
      "agents/reviewer.md",
      "workflows/ship.md",
      "rules/style.md",
      "skills/planning/SKILL.md",
    ]) {
      expect(r.err).toContain(`catalog/${f}: cannot be validated`);
    }
  });

  it("test_ca_25_missing_type_schema_fails_only_that_type", () => {
    const root = rootWithSchemas();
    catalog(root);
    rmSync(join(root, "schemas", "frontmatter", "agent.schema.json"));
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    expect(r.err.trim().split("\n")).toHaveLength(1);
    expect(r.err).toContain("catalog/agents/reviewer.md: cannot be validated");
    expect(r.err).toContain("urn:agent-kit:frontmatter:agent:v1");
  });

  it("test_ca_25_empty_catalog_passes_with_zero_files", () => {
    const root = rootWithSchemas();
    for (const d of ["agents", "workflows", "rules", "skills"])
      put(root, `catalog/${d}/.gitkeep`, "");
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(", 0 catalog files)");
    expect(checkSelfReport(root)).toEqual({ failures: [], catalogFiles: 0 });
  });
});

describe("check --self: fail closed on unexpected catalog entries", () => {
  it("test_ca_23_loose_markdown_in_skills_is_a_failure", () => {
    const root = rootWithSchemas();
    put(root, "catalog/skills/loose.md", plain("loose"));
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/catalog\/skills\/loose\.md: .*loose/);
    expect(r.err.trim().split("\n")).toHaveLength(1);
  });

  it("test_ca_23_symlinks_in_the_catalog_are_failures", (ctx) => {
    const root = rootWithSchemas();
    put(root, "outside/real.md", agent("linked"));
    put(root, "outside/skill/SKILL.md", plain("linked-skill"));
    put(root, "catalog/skills/own/real.md", "x");
    try {
      symlinkSync(join(root, "outside", "real.md"), join(root, "catalog", "agents", "linked.md"));
      symlinkSync(
        join(root, "outside", "skill"),
        join(root, "catalog", "skills", "linked-skill"),
        "dir",
      );
      symlinkSync(
        join(root, "outside", "real.md"),
        join(root, "catalog", "skills", "own", "SKILL.md"),
      );
    } catch {
      // Creating symlinks may need privileges (win32); the skip is visible in the test report.
      ctx.skip();
      return;
    }
    const r = run(["check", "--self", "--root", root]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/catalog\/agents\/linked\.md: .*symbolic link/);
    expect(r.err).toMatch(/catalog\/skills\/linked-skill: .*symbolic link/);
    expect(r.err).toMatch(/catalog\/skills\/own\/SKILL\.md: .*symbolic link/);
    expect(r.err.trim().split("\n")).toHaveLength(3);
  });
});
