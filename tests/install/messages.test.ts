import { chmodSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  doInit,
  doSync,
  doUpdate,
  installed,
  makePackage,
  makeProject,
  put,
  ruleMd,
  skillMd,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("messages", () => {
  it("test_ca_39_file_errors_carry_the_relative_path", () => {
    const pkg = makePackage();
    const root = installed(pkg);

    put(root, ".agents/rules/style.md", "edited\n");
    const conflict = doUpdate(root, pkg);
    expect(conflict.out + conflict.err).toContain(".agents/rules/style.md");

    const marked = makeProject();
    put(marked, "AGENTS.md", "<!-- agent-kit:begin -->\n");
    expect(doInit(marked, pkg).err).toContain("AGENTS.md");

    put(root, ".agents/local/skills/status/SKILL.md", skillMd("status"));
    expect(doSync(root, pkg).err).toContain(".agents/local/skills/status/SKILL.md");

    const lockless = makeProject();
    expect(doSync(lockless, pkg).err).toContain("agent-kit.lock.json");

    const usage = doInit(makeProject(), pkg, { cli: "nope" });
    expect(usage.err).toContain("claude, codex, antigravity".replace(/, /g, ", "));
  });

  it("test_ca_39_unreadable_file_and_unwritable_dir_give_relative_paths", (ctx) => {
    if (process.platform === "win32" || process.getuid?.() === 0) {
      ctx.skip();
      return;
    }
    const pkg = makePackage();
    const root = installed(pkg);
    const file = join(root, ".agents/rules/style.md");
    chmodSync(file, 0o000);
    const unreadable = doSync(root, pkg);
    chmodSync(file, 0o644);
    expect(unreadable.code).toBe(1);
    expect(unreadable.err).toContain(".agents/rules/style.md: cannot be read");
    expect(unreadable.err).not.toContain(root);
    expect(unreadable.err).not.toMatch(/\n\s+at /);

    const pkg2 = makePackage();
    put(pkg2, "catalog/rules/fresh.md", ruleMd("fresh"));
    const dir = join(root, ".agents/rules");
    chmodSync(dir, 0o555);
    const unwritable = doUpdate(root, pkg2, {}, { version: "1.1.0" });
    chmodSync(dir, 0o755);
    expect(unwritable.code).toBe(1);
    expect(unwritable.err).toContain(".agents/rules/fresh.md");
    expect(unwritable.err).not.toMatch(/\n\s+at /);
  });
});
