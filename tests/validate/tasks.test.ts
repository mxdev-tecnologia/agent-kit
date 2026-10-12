import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateJson } from "../../src/commands/validate.js";
import { loadRegistry } from "../../src/schemas/registry.js";

const registry = loadRegistry(join(import.meta.dirname, "..", "..", "schemas"));
const plan = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "fixtures", "validate", "envelope", "plan.valid.json"),
    "utf8",
  ),
);

type Step = {
  id: string;
  title: string;
  assignee: string;
  depends_on: string[];
  acceptance: string[];
};
const step = (id: string, deps: string[] = []): Step => ({
  id,
  title: id,
  assignee: "builder",
  depends_on: deps,
  acceptance: ["CA-01"],
});
const make = (steps: Step[], mode = "parallel", max = 2, extra: object = {}) => ({
  ...plan,
  ...extra,
  body: { mode, max_agents: max, steps },
});
const check = (value: unknown) =>
  validateJson("tasks", JSON.stringify(value), () => registry).map((i) => `${i.path} ${i.rule}`);

describe("validate tasks", () => {
  it("test_ca_13_cross_field_rules", () => {
    expect(check(make([step("a"), step("a")]))).toEqual(["/body/steps/1/id duplicate-id"]);
    expect(check(make([step("a", ["zz"])]))).toEqual(["/body/steps/0/depends_on/0 dangling-ref"]);
    expect(check(make([step("a", ["b"]), step("b", ["a"])]))).toEqual([
      "/body/steps/1/depends_on/0 dependency-cycle",
    ]);
    expect(check(make([step("a", ["a"])]))).toEqual([
      "/body/steps/0/depends_on/0 dependency-cycle",
    ]);
    expect(check(make([step("a")], "sequential", 2))).toEqual([
      "/body/max_agents sequential-max-agents",
    ]);
    expect(check(make([step("a")], "parallel", 2, { parent_id: plan.id }))).toEqual([
      "/parent_id parent-equals-id",
    ]);
    expect(check(make([step("a"), step("b", ["a"])], "parallel", 2))).toEqual([]);
    expect(check(make([step("a")], "sequential", 1))).toEqual([]);
  });

  it("test_ca_14_schema_errors_and_rules_together", () => {
    const got = check(make([step("a"), step("a")], "parallel", 11));
    expect(got).toContain("/body/max_agents schema");
    expect(got).toContain("/body/steps/1/id duplicate-id");
  });
});
