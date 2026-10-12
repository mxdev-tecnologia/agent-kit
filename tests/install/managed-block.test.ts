import { afterEach, describe, expect, it } from "vitest";
import { applyBlock, findBlock } from "../../src/install/managed-block.js";
import {
  cleanup,
  doInit,
  doSync,
  doUpdate,
  installed,
  makePackage,
  makeProject,
  put,
  read,
  ruleMd,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("managed block", () => {
  it("test_ca_08_append_replace_create", () => {
    const pkg = makePackage();
    const root = makeProject();
    const own = "# My project\n\nHand written.\n";
    put(root, "AGENTS.md", own);
    expect(doInit(root, pkg).code).toBe(0);
    const text = read(root, "AGENTS.md");
    expect(text.startsWith(own)).toBe(true);
    expect(text).toContain("<!-- agent-kit:begin -->");
    expect(findBlock(text).kind).toBe("ok");

    // Only the block changes when a marker exists.
    const marked = `before\n${text.slice(own.length)}after\n`;
    const replaced = applyBlock(marked, "NEW");
    expect(replaced.startsWith("before\n")).toBe(true);
    expect(replaced.endsWith("\n<!-- agent-kit:end -->\nafter\n")).toBe(true);
    expect(replaced).toContain("NEW");

    // No file: created with the block.
    const fresh = makeProject();
    doInit(fresh, pkg);
    expect(read(fresh, "AGENTS.md").startsWith("<!-- agent-kit:begin -->\n")).toBe(true);
  });

  const BAD: Record<string, string> = {
    "two begin":
      "<!-- agent-kit:begin -->\na\n<!-- agent-kit:begin -->\nb\n<!-- agent-kit:end -->\n",
    "end before begin": "<!-- agent-kit:end -->\n<!-- agent-kit:begin -->\n",
    "begin without end": "text\n<!-- agent-kit:begin -->\nmore text\n",
    "end without begin": "text\n<!-- agent-kit:end -->\n",
  };

  it.each(Object.entries(BAD))("test_ca_10_malformed_%s", (_name, content) => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, "AGENTS.md", content);
    const before = snapshot(root);
    const r = doInit(root, pkg);
    expect(r.code).toBe(1);
    expect(r.err).toContain("AGENTS.md");
    expect(snapshot(root)).toEqual(before);

    // update and sync on an installed project whose AGENTS.md was corrupted
    const ok = installed(pkg);
    put(ok, "AGENTS.md", content);
    const snap = snapshot(ok);
    for (const run of [doUpdate, doSync]) {
      const x = run(ok, pkg);
      expect(x.code).toBe(1);
      expect(x.err).toContain("AGENTS.md");
      expect(snapshot(ok)).toEqual(snap);
    }
  });

  it("test_ca_10_markers_inside_inlined_content_are_refused", () => {
    const pkg = makePackage();
    put(
      pkg,
      "catalog/rules/style.md",
      ruleMd("style", "always: true", "x <!-- agent-kit:end --> y\n"),
    );
    const root = makeProject();
    const r = doInit(root, pkg);
    expect(r.code).toBe(1);
    expect(r.err).toContain("catalog/rules/style.md");

    const pkg2 = makePackage();
    const proj = installed(pkg2);
    put(
      proj,
      ".agents/local/rules/team.md",
      ruleMd("team", "always: true", "<!-- agent-kit:begin -->\n"),
    );
    const s = doSync(proj, pkg2);
    expect(s.code).toBe(1);
    expect(s.err).toContain(".agents/local/rules/team.md");
  });
});
