import { afterEach, describe, expect, it } from "vitest";
import { createOps } from "../../src/install/apply.js";
import {
  agentMd,
  cleanup,
  doSync,
  doUpdate,
  installed,
  makePackage,
  put,
  read,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

const localAgent = `---\nformat: agent-kit/v1\nname: helper\ndescription: Local helper.\ntitle: Helper\ncapabilities: [read]\ntier: fast\n---\nHelp.\n`;

describe("sync", () => {
  it("test_ca_29_new_local_agent_generates_claude_file_and_keeps_version", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const kitFile = ".agents/rules/style.md";
    const mtime = snapshot(root)[kitFile]?.mtime;
    put(root, ".agents/local/agents/helper.md", localAgent);
    const r = doSync(root, pkg);
    expect(r.code).toBe(0);
    expect(read(root, ".claude/agents/helper.md")).toContain("tools: Read, Grep, Glob");
    expect(JSON.parse(read(root, "agent-kit.lock.json")).version).toBe("1.0.0");
    expect(snapshot(root)[kitFile]?.mtime).toBe(mtime);
  });

  it("test_ca_29_version_mismatch", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const before = snapshot(root);
    const r = doSync(root, pkg, {}, { version: "1.2.0" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("version-mismatch");
    expect(r.err).toContain("update");
    expect(snapshot(root)).toEqual(before);
  });

  it("test_ca_35_no_change_means_zero_writes", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const before = snapshot(root);
    for (const run of [doSync, doUpdate]) {
      const ops = createOps();
      const r = run(root, pkg, {}, { ops });
      expect(r.code).toBe(0);
      expect(ops.stats).toEqual({ writes: 0, deletes: 0 });
      expect(snapshot(root)).toEqual(before);
    }
    void agentMd;
  });
});
