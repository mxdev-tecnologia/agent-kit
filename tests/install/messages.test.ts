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
});
