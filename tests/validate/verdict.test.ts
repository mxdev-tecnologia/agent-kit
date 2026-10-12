import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateJson } from "../../src/commands/validate.js";
import { loadRegistry } from "../../src/schemas/registry.js";

const registry = loadRegistry(join(import.meta.dirname, "..", "..", "schemas"));
const base = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "fixtures", "validate", "envelope", "verdict.valid.json"),
    "utf8",
  ),
);
const finding = (id: string, severity: string) => ({ id, severity, message: "m" });
const make = (decision: string, findings: object[], extra: object = {}) => ({
  ...base,
  ...extra,
  body: { decision, findings, checked: [] },
});
const check = (value: unknown) =>
  validateJson("verdict", JSON.stringify(value), () => registry).map((i) => `${i.path} ${i.rule}`);

describe("validate verdict", () => {
  it("test_ca_15_rejected_and_ids", () => {
    expect(check(make("rejected", []))).toEqual(["/body/findings rejected-without-blocker"]);
    expect(check(make("rejected", [finding("a", "minor"), finding("b", "info")]))).toEqual([
      "/body/findings rejected-without-blocker",
    ]);
    expect(check(make("approved", [finding("a", "info"), finding("a", "info")]))).toEqual([
      "/body/findings/1/id duplicate-id",
    ]);
    expect(check(make("approved", [], { parent_id: base.id }))).toEqual([
      "/parent_id parent-equals-id",
    ]);
    expect(check(make("rejected", [finding("a", "major")]))).toEqual([]);
    expect(check(make("approved", []))).toEqual([]);
    expect(check(make("escalate", []))).toEqual([]);
  });
});
