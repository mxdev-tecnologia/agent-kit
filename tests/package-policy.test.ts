import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

describe("package policy", () => {
  it("test_ca_07_no_runtime_deps_and_exact_dev_versions", () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("test_ca_28_ajv_is_an_exact_dev_only_dependency", () => {
    expect(pkg.dependencies?.ajv).toBeUndefined();
    expect(pkg.optionalDependencies?.ajv).toBeUndefined();
    expect(pkg.peerDependencies?.ajv).toBeUndefined();
    expect(pkg.devDependencies?.ajv).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("test_ca_28_lockfile_has_only_registry_entries_with_integrity", () => {
    const resolutions = lockfile
      .split("\n")
      .filter((line) => line.trim().startsWith("resolution:"));
    expect(resolutions.length).toBeGreaterThan(0);
    for (const line of resolutions) {
      expect(line, line).toMatch(/integrity: sha512-[A-Za-z0-9+/=]+/);
      expect(line, line).not.toMatch(/tarball|git|directory|repo|commit/);
    }
    expect(lockfile).not.toMatch(/https?:\/\//);
  });
});
