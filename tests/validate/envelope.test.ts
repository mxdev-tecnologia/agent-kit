import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateJson } from "../../src/commands/validate.js";
import { loadRegistry } from "../../src/schemas/registry.js";
import { ENVELOPE_KINDS } from "../../src/validate/envelope-rules.js";

const DIR = join(import.meta.dirname, "..", "fixtures", "validate", "envelope");
const registry = loadRegistry(join(import.meta.dirname, "..", "..", "schemas"));
const load = (name: string) => readFileSync(join(DIR, `${name}.json`), "utf8");
const env = (text: string) => validateJson("envelope", text, () => registry);
const rulesOf = (text: string) => env(text).map((i) => `${i.path} ${i.rule}`);

describe("validate envelope", () => {
  it.each(ENVELOPE_KINDS)("test_ca_16_%s", (kind) => {
    expect(env(load(`${kind}.valid`))).toEqual([]);
    expect(rulesOf(load(`${kind}.invalid`))).toEqual(["/id schema"]);
    expect(rulesOf(load(`${kind}.parent-equals-id`))).toEqual(["/parent_id parent-equals-id"]);
  });

  it("test_ca_16_blocked_and_task_duplicates", () => {
    const blocked = JSON.parse(load("blocked.valid"));
    const opt = (id: string) => ({ id, label: "L", recommended: false });
    blocked.body.options = [opt("a"), opt("a")];
    expect(rulesOf(JSON.stringify(blocked))).toEqual(["/body/options/1/id duplicate-id"]);
    const task = JSON.parse(load("task.valid"));
    task.body.acceptance = [
      { id: "CA-01", text: "t" },
      { id: "CA-01", text: "t" },
    ];
    expect(rulesOf(JSON.stringify(task))).toEqual(["/body/acceptance/1/id duplicate-id"]);
  });

  it("test_ca_17_wrong_kind_unknown_schema_json_parse", () => {
    const wrong = validateJson("verdict", load("plan.valid"), () => registry);
    expect(wrong.map((i) => i.rule)).toEqual(["wrong-kind"]);
    expect(wrong[0]?.message).toContain("cortex.verdict/v1");
    const foo = JSON.parse(load("plan.valid"));
    foo.schema = "cortex.foo/v1";
    expect(env(JSON.stringify(foo)).map((i) => i.rule)).toEqual(["unknown-schema"]);
    const bad = env('{\n  "a": 1,\n}');
    expect(bad.map((i) => i.rule)).toEqual(["json-parse"]);
    expect(bad[0]?.message).toMatch(/line 3|line 2/);
  });
});
