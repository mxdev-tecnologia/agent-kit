import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOps } from "../../src/install/apply.js";
import {
  cleanup,
  doInit,
  doSync,
  doUpdate,
  exists,
  installed,
  makePackage,
  makeProject,
  put,
  read,
  ruleMd,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

const V2 = { version: "1.1.0" };

describe("update", () => {
  it("test_ca_25_updates_creates_and_writes_lock_last", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const pkg2 = makePackage();
    put(pkg2, "catalog/rules/style.md", ruleMd("style", "always: true", "Changed.\n"));
    put(pkg2, "catalog/rules/extra.md", ruleMd("extra"));
    const order: string[] = [];
    const ops = createOps();
    const rename = ops.rename;
    ops.rename = (from, to) => {
      order.push(to);
      rename(from, to);
    };
    const r = doUpdate(root, pkg2, {}, { ...V2, ops });
    expect(r.code).toBe(0);
    expect(r.out).toContain("update    .agents/rules/style.md");
    expect(r.out).toContain("create    .agents/rules/extra.md");
    expect(read(root, ".agents/rules/style.md")).toContain("Changed.");
    const lock = JSON.parse(read(root, "agent-kit.lock.json"));
    expect(lock.version).toBe("1.1.0");
    expect(Object.keys(lock.files)).toContain(".agents/rules/extra.md");
    expect(order.at(-1)).toMatch(/agent-kit\.lock\.json$/);
    expect(order.filter((p) => p.endsWith("agent-kit.lock.json"))).toHaveLength(1);
  });

  it("test_ca_25_downgrade_is_refused_unless_forced", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const before = snapshot(root);
    const r = doUpdate(root, pkg, {}, { version: "0.9.0" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("version-downgrade");
    expect(snapshot(root)).toEqual(before);
    const f = doUpdate(root, pkg, { force: true }, { version: "0.9.0" });
    expect(f.code).toBe(0);
    expect(JSON.parse(read(root, "agent-kit.lock.json")).version).toBe("0.9.0");
  });

  it("test_ca_26_conflicts_write_nothing_and_force_overrides", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const pkg2 = makePackage();
    put(pkg2, "catalog/rules/ts-style.md", ruleMd("ts-style", "always: true", "New.\n"));
    put(root, ".agents/rules/style.md", "edited by hand\n");
    const before = snapshot(root);
    for (const run of [doUpdate]) {
      const r = run(root, pkg2, {}, V2);
      expect(r.code).toBe(1);
      expect(r.out).toContain("conflict  .agents/rules/style.md");
      expect(snapshot(root)).toEqual(before);
    }
    const s = doSync(root, pkg);
    expect(s.code).toBe(1);
    expect(snapshot(root)).toEqual(before);
    const f = doUpdate(root, pkg2, { force: true }, V2);
    expect(f.code).toBe(0);
    expect(read(root, ".agents/rules/style.md")).toContain("Rule style body.");
    expect(read(root, ".agents/rules/ts-style.md")).toContain("New.");
    put(root, ".agents/rules/style.md", "again\n");
    const f2 = doSync(root, pkg2, { force: true }, V2);
    expect(f2.code).toBe(0);
  });

  it("test_ca_27_unmanaged_file_conflict_force_does_not_override", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, ".agents/rules/style.md", "mine\n");
    const before = snapshot(root);
    const r = doInit(root, pkg);
    expect(r.code).toBe(1);
    expect(r.out).toContain("conflict  .agents/rules/style.md");
    expect(snapshot(root)).toEqual(before);

    // update/sync --force on an installed project with a new kit file the user already has
    const root2 = installed(pkg);
    const pkg2 = makePackage();
    put(pkg2, "catalog/rules/extra.md", ruleMd("extra"));
    put(root2, ".agents/rules/extra.md", "user file\n");
    const snap = snapshot(root2);
    for (const force of [false, true]) {
      const u = doUpdate(root2, pkg2, { force }, V2);
      expect(u.code).toBe(1);
      expect(snapshot(root2)).toEqual(snap);
    }
  });

  it("test_ca_27_equal_content_is_adopted_without_rewrite", () => {
    const pkg = makePackage();
    const first = installed(pkg);
    const root = makeProject();
    put(root, ".agents/rules/style.md", read(first, ".agents/rules/style.md"));
    const mtime = snapshot(root)[".agents/rules/style.md"]?.mtime;
    const r = doInit(root, pkg);
    expect(r.code).toBe(0);
    expect(r.out).toContain("unchanged .agents/rules/style.md");
    expect(snapshot(root)[".agents/rules/style.md"]?.mtime).toBe(mtime);
    expect(JSON.parse(read(root, "agent-kit.lock.json")).files).toHaveProperty(
      ".agents/rules/style.md",
    );
  });

  it("test_ca_27_handwritten_agents_md_and_foreign_block", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, "AGENTS.md", "mine\n");
    put(root, "CLAUDE.md", "# mine\n");
    expect(doInit(root, pkg, { cli: "claude" }).code).toBe(0);
    expect(read(root, "AGENTS.md").startsWith("mine\n")).toBe(true);
    expect(read(root, "CLAUDE.md")).toContain("@AGENTS.md");

    const other = makeProject();
    put(other, "AGENTS.md", "<!-- agent-kit:begin -->\nforeign\n<!-- agent-kit:end -->\n");
    const before = snapshot(other);
    const r = doInit(other, pkg, { cli: "claude" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("conflict  AGENTS.md");
    expect(snapshot(other)).toEqual(before);
  });

  it("test_ca_28_removed_files_are_deleted_only_when_unedited", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const pkg2 = makePackage();
    rmSync(join(pkg2, "catalog/rules/style.md"));
    rmSync(join(pkg2, "catalog/rules/ts-style.md"));
    put(root, ".agents/rules/ts-style.md", "edited\n");
    const before = snapshot(root);
    const r = doUpdate(root, pkg2, {}, V2);
    expect(r.code).toBe(1);
    expect(snapshot(root)).toEqual(before);
    const f = doUpdate(root, pkg2, { force: true }, V2);
    expect(f.code).toBe(0);
    expect(exists(root, ".agents/rules/style.md")).toBe(false);
    expect(read(root, ".agents/rules/ts-style.md")).toBe("edited\n");
    expect(JSON.parse(read(root, "agent-kit.lock.json")).files).not.toHaveProperty(
      ".agents/rules/ts-style.md",
    );
  });

  it("test_ca_34_aborted_update_converges_on_rerun", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const pkg2 = makePackage();
    put(pkg2, "catalog/rules/style.md", ruleMd("style", "always: true", "V2 style.\n"));
    put(pkg2, "catalog/rules/ts-style.md", ruleMd("ts-style", "always: true", "V2 ts.\n"));
    put(pkg2, "catalog/rules/extra.md", ruleMd("extra"));
    let renames = 0;
    const ops = createOps();
    const rename = ops.rename;
    ops.rename = (a, b) => {
      if (++renames === 3) throw new Error("simulated abort");
      rename(a, b);
    };
    const aborted = doUpdate(root, pkg2, {}, { ...V2, ops });
    expect(aborted.code).toBe(1);
    expect(JSON.parse(read(root, "agent-kit.lock.json")).version).toBe("1.0.0");
    const again = doUpdate(root, pkg2, {}, V2);
    expect(again.code).toBe(0);
    expect(again.out).not.toContain("conflict");
    expect(JSON.parse(read(root, "agent-kit.lock.json")).version).toBe("1.1.0");
    expect(read(root, ".agents/rules/extra.md")).toContain("extra");
    expect(doSync(root, pkg2, {}, V2).out).toContain("Nothing to do");
  });
});
