import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const dependabot = readFileSync(".github/dependabot.yml", "utf8");

function stripComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

const ciCode = stripComments(ci);

describe("ci policy", () => {
  it("test_ca_01_triggers_matrix_and_steps", () => {
    expect(ciCode).toMatch(/^on:\s*\n\s+pull_request:\s*\n\s+branches:\s*\[develop, main\]/m);
    expect(ciCode).toMatch(/^\s+push:\s*\n\s+branches:\s*\[develop\]/m);
    expect(ciCode).toMatch(/os: ubuntu-latest\s*\n\s+node: 22\b/);
    expect(ciCode).toMatch(/os: ubuntu-latest\s*\n\s+node: 24\b/);
    expect(ciCode).toMatch(/os: windows-latest\s*\n\s+node: 22\b/);
    const runs = [...ciCode.matchAll(/^\s+run:\s*(.+)$/gm)].map((m) => m[1]?.trim());
    expect(runs).toContain("pnpm install --frozen-lockfile");
    for (const cmd of [
      "pnpm --silent lint",
      "pnpm --silent typecheck",
      "pnpm --silent test",
      "pnpm --silent build",
      "node dist/cli.js check --self",
      "pnpm --silent test:smoke",
    ]) {
      expect(runs, cmd).toContain(cmd);
    }
  });

  it("test_ca_02_no_continue_on_error", () => {
    expect(ciCode).not.toMatch(/continue-on-error/);
  });

  it("test_ca_03_dependabot_ecosystems_weekly_develop", () => {
    for (const eco of ["github-actions", "npm"]) {
      const block = dependabot
        .split(/^\s*- package-ecosystem:/m)
        .find((b) => b.trim().startsWith(eco));
      expect(block, eco).toBeDefined();
      expect(block).toMatch(/interval:\s*weekly/);
      expect(block).toMatch(/target-branch:\s*develop/);
    }
  });

  it("test_ca_06_hardening", () => {
    expect(ciCode).toMatch(/^permissions:\s*\n\s+contents: read\s*$/m);
    expect(ciCode.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(ciCode).not.toMatch(/:\s*write\b|write-all/);
    expect(ciCode).not.toMatch(/pull_request_target/);
    expect(ciCode).not.toMatch(/secrets\./);
    const uses = [...ci.matchAll(/^\s+(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(0);
    for (const m of uses) {
      const ref = m[1] ?? "";
      if (ref.startsWith("./")) continue;
      expect(ref, ref).toMatch(/@[0-9a-f]{40}$/);
      expect(m[2], ref).toMatch(/^\s+#\s*v\d+/);
    }
  });

  it("test_ca_07_concurrency_per_ref", () => {
    expect(ciCode).toMatch(
      /^concurrency:\s*\n\s+group:.*github\.ref.*\n\s+cancel-in-progress: true/m,
    );
  });

  it("test_ca_08_pnpm_from_package_manager", () => {
    expect(ciCode).toMatch(/corepack enable/);
    expect(ciCode).not.toMatch(/pnpm@latest/);
    expect(ciCode).not.toMatch(/corepack prepare/);
  });
});
