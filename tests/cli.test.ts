import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

const pkgVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string })
  .version;

function run(args: string[]) {
  let out = "";
  let err = "";
  const code = main(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe("cli", () => {
  it.each([["--version"], ["-v"]])("test_ca_01_version_%s", (flag) => {
    const r = run([flag]);
    expect(r.out).toBe(`${pkgVersion}\n`);
    expect(r.code).toBe(0);
  });

  it("test_ca_44_check_without_self_runs_the_drift_check", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-kit-cli-"));
    try {
      const r = run(["check", "--root", root]);
      expect(r.code).toBe(1);
      expect(r.err).toContain("agent-kit.lock.json");
      expect(r.err).not.toContain("Usage:");
      expect(run(["check", "--self", "--root", root]).code).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("test_ca_44_usage_lists_the_four_commands", () => {
    const r = run(["--help"]);
    for (const c of ["init", "update", "sync", "check"]) expect(r.out).toContain(`  ${c} `);
    expect(r.out).toContain("--dry-run");
    expect(r.out).toContain("--force");
    expect(r.out).toContain("--cli");
  });

  it("test_ca_44_missing_root_is_a_usage_error_for_every_command", () => {
    for (const c of ["init", "update", "sync", "check"]) {
      const r = run([
        c,
        "--root",
        "/nonexistent/agent-kit-root",
        ...(c === "init" ? ["--cli", "claude"] : []),
      ]);
      expect(r.code).toBe(2);
      expect(r.err).toContain("/nonexistent/agent-kit-root");
    }
  });

  it.each([["--help"], ["-h"], []])("test_ca_02_help_%j", (...args) => {
    const r = run(args.flat());
    expect(r.out).toContain("check");
    expect(r.out).toContain("--version");
    expect(r.out).toContain("--help");
    expect(r.code).toBe(0);
  });

  it.each([
    [["bogus"]],
    [["--bogus"]],
    [["init", "extra"]],
    [["init", "--self"]],
    [["update", "--cli", "claude"]],
    [["sync", "--bogus-flag"]],
    [["check", "--force"]],
  ])("test_ca_03_usage_error_%j", (args) => {
    const r = run(args);
    expect(r.out).toBe("");
    expect(r.err).toContain("Error:");
    expect(r.err).toContain("Usage:");
    expect(r.code).toBe(2);
  });
});
