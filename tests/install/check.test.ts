import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  doCheck,
  installed,
  localRule,
  makePackage,
  put,
  read,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("check", () => {
  it("test_ca_30_clean_project_exits_0", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const r = doCheck(root, pkg);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
  });

  it("test_ca_30_every_finding_is_listed_and_disk_unchanged", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    rmSync(join(root, ".agents/workflows/ship.md"));
    put(root, ".agents/rules/style.md", "edited\n");
    // a managed orphan: a lock entry the package no longer produces
    const lock = JSON.parse(read(root, "agent-kit.lock.json"));
    put(root, ".agents/rules/old.md", "old\n");
    lock.files[".agents/rules/old.md"] =
      `sha256-${createHash("sha256").update("old\n").digest("hex")}`;
    put(root, "agent-kit.lock.json", `${JSON.stringify(lock, null, 2)}\n`);
    put(root, ".agents/local/rules/status.md", localRule("status"));
    put(root, ".agents/local/rules/broken.md", "---\nname: broken\n---\n");
    const before = snapshot(root);
    const r = doCheck(root, pkg);
    expect(r.code).toBe(1);
    expect(r.err).toContain("missing: .agents/workflows/ship.md");
    expect(r.err).toContain("edited: .agents/rules/style.md");
    expect(r.err).toContain("orphan: .agents/rules/old.md");
    expect(r.err).toContain(".agents/local/rules/status.md");
    expect(r.err).toContain(".agents/local/rules/broken.md");
    expect(snapshot(root)).toEqual(before);
  });

  it("test_ca_30_other_version_is_a_finding", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const r = doCheck(root, pkg, { version: "2.0.0" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("version-mismatch");
    expect(r.err).toContain("update");
  });
});
