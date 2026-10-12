import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const cli = join(process.cwd(), "dist", "cli.js");
const tmp: string[] = [];
afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
});

const run = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [cli, ...args, "--root", cwd], { encoding: "utf8" });

describe("smoke: install", () => {
  it("test_ca_43_installs_three_clis_check_ok_and_sync_writes_nothing", () => {
    expect(existsSync(cli), "run `pnpm build` first").toBe(true);
    const root = mkdtempSync(join(tmpdir(), "agent-kit-smoke-"));
    tmp.push(root);
    const init = run(root, ["init", "--cli", "claude,codex,antigravity"]);
    expect(init.status, init.stderr).toBe(0);
    for (const f of [
      "AGENTS.md",
      "CLAUDE.md",
      "agent-kit.lock.json",
      ".agents/schemas/common.schema.json",
      ".agents/schemas/install/lock.schema.json",
    ]) {
      expect(existsSync(join(root, f)), f).toBe(true);
    }
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toContain("@AGENTS.md");
    const check = run(root, ["check"]);
    expect(check.status, check.stderr).toBe(0);
    const before = readFileSync(join(root, "agent-kit.lock.json"), "utf8");
    const sync = run(root, ["sync"]);
    expect(sync.status, sync.stderr).toBe(0);
    expect(sync.stdout).toContain("Nothing to do");
    expect(readFileSync(join(root, "agent-kit.lock.json"), "utf8")).toBe(before);
    writeFileSync(
      join(root, "AGENTS.md"),
      `${readFileSync(join(root, "AGENTS.md"), "utf8")}\nmine\n`,
    );
    expect(run(root, ["check"]).status).toBe(0);
  });
});
