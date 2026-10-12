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
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("dry-run", () => {
  it("test_ca_31_init_update_sync_dry_run_change_nothing", () => {
    const pkg = makePackage();
    const empty = makeProject();
    const i = doInit(empty, pkg, { dryRun: true, cli: "claude" });
    expect(i.code).toBe(0);
    expect(i.out).toContain("create    AGENTS.md");
    expect(snapshot(empty)).toEqual({});

    const root = installed(pkg);
    const pkg2 = makePackage();
    put(pkg2, "catalog/rules/style.md", ruleMd("style", "always: true", "V2.\n"));
    put(root, ".agents/rules/ts-style.md", "edited\n");
    const before = snapshot(root);
    const u = doUpdate(root, pkg2, { dryRun: true }, { version: "1.1.0" });
    expect(u.out).toMatch(/update {4}\.agents\/rules\/style\.md/);
    expect(u.out).toContain("conflict  .agents/rules/ts-style.md");
    expect(u.out).toContain("unchanged ");
    const s = doSync(root, pkg, { dryRun: true });
    expect(s.out).toContain("conflict");
    expect(snapshot(root)).toEqual(before);

    const clean = installed(pkg);
    put(pkg, "catalog/rules/fresh.md", ruleMd("fresh"));
    const snap = snapshot(clean);
    const d = doUpdate(clean, pkg, { dryRun: true });
    expect(d.code).toBe(0);
    expect(d.out).toContain("create    .agents/rules/fresh.md");
    expect(snapshot(clean)).toEqual(snap);
  });
});
