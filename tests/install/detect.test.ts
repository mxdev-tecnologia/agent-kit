import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOps } from "../../src/install/apply.js";
import { detectClis } from "../../src/install/detect.js";
import {
  cleanup,
  doInit,
  exists,
  listFiles,
  makePackage,
  makeProject,
  put,
  read,
  tempDir,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("detect", () => {
  it("test_ca_01_codex_dir_and_agy_on_path", () => {
    const pkg = makePackage();
    const root = makeProject();
    const bin = tempDir();
    put(bin, "agy", "exit 1", 0o644); // never executed
    put(root, ".codex/config", "x");
    const r = doInit(root, pkg, {}, { env: { PATH: bin } });
    expect(r.code).toBe(0);
    expect(JSON.parse(read(root, "agent-kit.lock.json")).clis).toEqual(["antigravity", "codex"]);
    expect(exists(root, "CLAUDE.md")).toBe(false);
    expect(r.out).toContain("Detected CLIs: codex, antigravity");
  });

  it("test_ca_01_claude_cmd_with_pathext", () => {
    const root = makeProject();
    const bin = tempDir();
    put(bin, "claude.cmd", "@echo off");
    const found = detectClis(root, { PATH: bin, PATHEXT: ".CMD;.EXE" }, createOps(), "win32");
    expect(found).toEqual(["claude"]);
    const none = detectClis(root, { PATH: bin }, createOps(), "linux");
    expect(none).toEqual([]);
  });

  it("test_ca_01_only_agents_local_does_not_select_antigravity", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, ".agents/local/rules/x.md", "x");
    expect(detectClis(root, { PATH: "" }, createOps())).toEqual([]);
    expect(doInit(root, pkg, {}).code).toBe(2);
    put(root, ".agents/other", "x");
    expect(detectClis(root, { PATH: "" }, createOps())).toEqual(["antigravity"]);
    expect(listFiles(join(root, ".agents"))).toContain("other");
  });
});
