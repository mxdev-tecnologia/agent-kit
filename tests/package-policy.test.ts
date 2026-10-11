import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("package policy", () => {
  it("test_ca_07_no_runtime_deps_and_exact_dev_versions", () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
