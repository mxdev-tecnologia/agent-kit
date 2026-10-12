import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateSpec } from "../../src/validate/spec.js";

const SDD = join(import.meta.dirname, "..", "..", "docs", "sdd");
const specs = readdirSync(SDD)
  .filter((name) => /^[0-9].*\.md$/.test(name))
  .sort();

describe("validate spec on the real specs", () => {
  it("test_ca_12_found_specs", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it.each(specs)("test_ca_12_%s", (name) => {
    const issues = validateSpec(readFileSync(join(SDD, name), "utf8"), name);
    expect(issues).toEqual([]);
  });
});
