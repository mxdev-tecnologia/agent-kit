import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

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
