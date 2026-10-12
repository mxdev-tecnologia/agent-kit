import { afterEach, describe, expect, it } from "vitest";
import { COLLISIONS, nameCollisions, RESERVED_NAMES } from "../../src/catalog/collisions.js";
import {
  cleanup,
  doInit,
  makePackage,
  makeProject,
  put,
  skillMd,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("collisions", () => {
  it("test_ca_18_constant_shape", () => {
    expect(Object.keys(COLLISIONS).sort()).toEqual(["antigravity", "claude", "codex"]);
    for (const names of Object.values(COLLISIONS)) {
      expect(new Set(names).size).toBe(names.length);
    }
    expect(COLLISIONS.claude).toContain("security-review");
    expect(COLLISIONS.codex).toContain("prompts");
    expect(COLLISIONS.antigravity).toContain("remember");
    expect(new Set(RESERVED_NAMES).size).toBe(RESERVED_NAMES.length);
    for (const n of ["con", "prn", "aux", "nul", "com1", "com9", "lpt1", "lpt9"]) {
      expect(RESERVED_NAMES).toContain(n);
    }
    expect(RESERVED_NAMES).toHaveLength(22);
    expect(nameCollisions("review")).toHaveLength(1);
    expect(nameCollisions("review", ["claude"])).toHaveLength(1);
    expect(nameCollisions("prompts", ["claude"])).toHaveLength(0);
  });

  it("test_ca_18_catalog_name_equal_to_an_entry_fails_init", () => {
    const pkg = makePackage();
    put(pkg, "catalog/skills/status/SKILL.md", skillMd("status"));
    const root = makeProject();
    const r = doInit(root, pkg, { cli: "claude" });
    expect(r.code).toBe(1);
    expect(r.err).toContain("catalog/skills/status/SKILL.md");
    expect(r.err).toContain('"status"');
    expect(snapshot(root)).toEqual({});
  });
});
