import { chmodSync, lstatSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInit } from "../../src/commands/init.js";
import { runSync } from "../../src/commands/sync.js";
import { runUpdate } from "../../src/commands/update.js";
import {
  capture,
  cleanup,
  ctxFor,
  exists,
  listFiles,
  makePackage,
  makeProject,
  put,
  read,
  skillMd,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

const init = (root: string, args: Record<string, unknown>, pkg: string, ctx = {}) =>
  capture((io) => runInit({ root, ...args }, io, ctxFor(pkg, ctx)));

describe("init", () => {
  it("test_ca_02_cli_flag_installs_only_those_targets", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, ".claude/keep", "x"); // claude would be detected
    const r = init(root, { cli: "codex" }, pkg);
    expect(r.code).toBe(0);
    expect(exists(root, ".claude/agents/reviewer.md")).toBe(false);
    expect(exists(root, "CLAUDE.md")).toBe(false);
    expect(exists(root, ".agents/skills/ship/SKILL.md")).toBe(true);
    expect(exists(root, ".agents/skills/planning/SKILL.md")).toBe(true);
    expect(JSON.parse(read(root, "agent-kit.lock.json")).clis).toEqual(["codex"]);
  });

  it("test_ca_03_no_cli_detected_and_unknown_cli_exit_2", () => {
    const pkg = makePackage();
    for (const args of [{}, { cli: "foo" }]) {
      const root = makeProject();
      const r = init(root, args, pkg);
      expect(r.code).toBe(2);
      for (const c of ["claude", "codex", "antigravity"]) expect(r.err).toContain(c);
      expect(listFiles(root)).toEqual([]);
    }
  });

  it("test_ca_04_existing_lock_exits_1_and_suggests_update", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, "agent-kit.lock.json", "{}");
    const before = snapshot(root);
    const r = init(root, { cli: "claude" }, pkg);
    expect(r.code).toBe(1);
    expect(r.err).toContain("update");
    expect(snapshot(root)).toEqual(before);
  });

  it("test_ca_05_installs_from_the_package_not_the_project", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, "catalog/skills/own/SKILL.md", skillMd("own"));
    put(root, "schemas/mine.json", "{}");
    const before = snapshot(root);
    const r = init(root, { cli: "claude" }, pkg);
    expect(r.code).toBe(0);
    expect(exists(root, ".agents/skills/own")).toBe(false);
    expect(exists(root, ".agents/schemas/mine.json")).toBe(false);
    expect(read(root, "catalog/skills/own/SKILL.md")).toBe(skillMd("own"));
    for (const [p, e] of Object.entries(before)) expect(snapshot(root)[p]).toEqual(e);
  });

  it("test_ca_06_missing_root_exits_2_for_every_command", () => {
    const pkg = makePackage();
    const missing = join(makeProject(), "nope");
    expect(init(missing, { cli: "claude" }, pkg).code).toBe(2);
    const sync = capture((io) => runSync({ root: missing }, io, ctxFor(pkg)));
    expect(sync.code).toBe(2);
    expect(sync.err).toContain(missing);
  });

  it("test_ca_06_symlinked_root_writes_inside_the_real_directory", (ctx) => {
    const pkg = makePackage();
    const real = makeProject();
    const link = join(makeProject(), "link");
    try {
      symlinkSync(real, link, "dir");
    } catch {
      ctx.skip();
      return;
    }
    const r = init(link, { cli: "claude" }, pkg);
    expect(r.code).toBe(0);
    expect(exists(real, "agent-kit.lock.json")).toBe(true);
  });

  it("test_ca_14_regular_files_exec_bit_and_empty_dir_removal", (ctx) => {
    const pkg = makePackage();
    const root = makeProject();
    expect(init(root, { cli: "claude,codex,antigravity" }, pkg).code).toBe(0);
    const walk = (rel: string): void => {
      const snap = snapshot(root, rel);
      for (const [p, e] of Object.entries(snap)) expect(e.kind).not.toBe("link", p);
    };
    walk("");
    if (process.platform !== "win32") {
      for (const p of [
        ".agents/skills/planning/scripts/run.sh",
        ".claude/skills/planning/scripts/run.sh",
      ]) {
        expect(lstatSync(join(root, p)).mode & 0o111).not.toBe(0);
      }
      expect(
        lstatSync(join(root, ".agents/skills/planning/references/guide.md")).mode & 0o111,
      ).toBe(0);
    } else ctx.skip();
  });

  it("test_ca_14_deleting_empties_managed_dirs_but_never_local", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(
      root,
      ".agents/local/rules/team.md",
      "---\nformat: agent-kit/v1\nname: team\ndescription: Team.\n---\nTeam.\n",
    );
    expect(init(root, { cli: "claude" }, pkg).code).toBe(0);
    // The next kit version drops the whole skills folder.
    const pkg2 = makePackage();
    rmSync(join(pkg2, "catalog", "skills"), { recursive: true });
    const u = capture((io) => runUpdate({ root }, io, ctxFor(pkg2, { version: "1.0.1" })));
    expect(u.code).toBe(0);
    expect(exists(root, ".agents/skills")).toBe(false);
    expect(exists(root, ".claude/skills")).toBe(false);
    expect(exists(root, ".agents/local/rules/team.md")).toBe(true);
  });

  it("test_ca_14_mode_does_not_change_the_lock_hash", () => {
    const pkg = makePackage();
    const root = makeProject();
    init(root, { cli: "antigravity" }, pkg);
    const lock = read(root, "agent-kit.lock.json");
    if (process.platform !== "win32") {
      chmodSync(join(root, ".agents/skills/planning/scripts/run.sh"), 0o644);
    }
    const r = capture((io) => runSync({ root }, io, ctxFor(pkg)));
    expect(r.code).toBe(0);
    expect(read(root, "agent-kit.lock.json")).toBe(lock);
  });
});
