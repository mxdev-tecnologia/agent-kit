import { mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyChanges,
  createOps,
  InstallError,
  type Ops,
  relPathProblem,
} from "../../src/install/apply.js";
import {
  cleanup,
  doCheck,
  doInit,
  doSync,
  exists,
  installed,
  listFiles,
  makePackage,
  makeProject,
  put,
  read,
  snapshot,
  tempDir,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

const w = (path: string, text = "x") => ({
  writes: [{ path, data: Buffer.from(text) }],
  deletes: [],
});

describe("apply", () => {
  it("test_ca_20_unsafe_reference_names_are_refused", () => {
    for (const bad of ["../x", "/abs/x", "a:b", "trail.", "nul.md", "a\\b", "sp ace"]) {
      expect(relPathProblem(`references/${bad}`), bad).toBeDefined();
    }
    expect(relPathProblem("references/ok-1.md")).toBeUndefined();

    const pkg = makePackage();
    const root = installed(pkg);
    put(
      root,
      ".agents/local/skills/s/SKILL.md",
      `---\nformat: agent-kit/v1\nname: s\ndescription: S.\n---\nS.\n`,
    );
    // On Windows "a:b" names an alternate data stream of "a", so it never reaches the installer as a name.
    const onDisk =
      process.platform === "win32" ? ["trail.", "nul.md"] : ["a:b", "trail.", "nul.md"];
    for (const bad of onDisk) put(root, `.agents/local/skills/s/references/${bad}`, "x");
    const before = snapshot(root);
    const r = doSync(root, pkg);
    expect(r.code).toBe(1);
    for (const bad of onDisk) expect(r.err).toContain(`references/${bad}`);
    expect(snapshot(root)).toEqual(before);
  });

  it("test_ca_32_unsafe_destinations_are_refused", (ctx) => {
    const root = makeProject();
    const outside = tempDir();
    mkdirSync(join(root, ".agents"));
    const ops = createOps();
    for (const bad of [
      "../escape.md",
      "/tmp/escape.md",
      ".agents/../../escape.md",
      "package.json",
    ]) {
      expect(() => applyChanges(root, w(bad), ops), bad).toThrow(InstallError);
    }
    try {
      symlinkSync(outside, join(root, ".agents", "rules"), "dir");
      put(root, ".agents/real.md", "x");
      mkdirSync(join(root, ".agents", "agents"));
      symlinkSync(join(root, ".agents", "real.md"), join(root, ".agents", "agents", "f.md"));
    } catch {
      ctx.skip();
      return;
    }
    expect(() => applyChanges(root, w(".agents/rules/x.md"), ops)).toThrow(
      /\.agents\/rules\/x\.md.*symbolic link/,
    );
    expect(() => applyChanges(root, w(".agents/agents/f.md"), ops)).toThrow(/symbolic link/);
    expect(readdirSync(outside)).toEqual([]);
    expect(exists(root, "../escape.md")).toBe(false);
    expect(read(root, ".agents/real.md")).toBe("x");
  });

  it("test_ca_33_failure_before_rename_keeps_old_file_and_no_temp", () => {
    const root = makeProject();
    put(root, "AGENTS.md", "old");
    const ops = createOps({
      rename: () => {
        throw new Error("boom");
      },
    });
    expect(() => applyChanges(root, w("AGENTS.md", "new"), ops)).toThrow(/AGENTS\.md/);
    expect(read(root, "AGENTS.md")).toBe("old");
    expect(listFiles(root)).toEqual(["AGENTS.md"]);
  });

  it("test_ca_33_eperm_is_retried_then_gives_up", () => {
    const real = createOps();
    let calls = 0;
    const flaky: Ops = createOps({
      sleep: () => {},
      rename: (a, b) => {
        if (++calls <= 4) throw Object.assign(new Error("busy"), { code: "EPERM" });
        real.rename(a, b);
      },
    });
    const root = makeProject();
    applyChanges(root, w("AGENTS.md", "ok"), flaky);
    expect(calls).toBe(5);
    expect(read(root, "AGENTS.md")).toBe("ok");

    let always = 0;
    const stuck = createOps({
      sleep: () => {},
      rename: () => {
        always++;
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      },
    });
    const root2 = makeProject();
    expect(() => applyChanges(root2, w("CLAUDE.md"), stuck)).toThrow(/CLAUDE\.md/);
    expect(always).toBe(5);
    expect(listFiles(root2)).toEqual([]);
  });

  it("test_ca_41_env_and_key_files_are_never_opened", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, ".env", "SECRET=1");
    put(root, "service_account.json", "{}");
    const touched: string[] = [];
    const base = createOps();
    const ops = createOps({
      lstat: (p) => {
        touched.push(p);
        return base.lstat(p);
      },
      readFile: (p) => {
        touched.push(p);
        return base.readFile(p);
      },
      readdir: (p) => {
        touched.push(p);
        return base.readdir(p);
      },
    });
    expect(doInit(root, pkg, undefined, { ops }).code).toBe(0);
    expect(doSync(root, pkg, {}, { ops }).code).toBe(0);
    expect(doCheck(root, pkg, { ops }).code).toBe(0);
    expect(touched.length).toBeGreaterThan(10);
    expect(touched.filter((p) => /\.env|service_account/.test(p))).toEqual([]);
  });
});
