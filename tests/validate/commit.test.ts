import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCommit } from "../../src/validate/commit.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "validate", "commit");
const rules = (text: string) => validateCommit(text, "m").map((i) => i.rule);

describe("validate commit", () => {
  it("test_ca_18_header_format", () => {
    for (const ok of ["feat(cli): add x", "fix: y", "docs(sdd-06): z"]) {
      expect(rules(ok)).toEqual([]);
    }
    for (const bad of ["feature: a", "feat(CLI): b", "feat(): c", "feat:", "feat(cli) d"]) {
      expect(rules(bad), bad).toContain("commit-header");
    }
  });

  it("test_ca_19_header_length_and_period", () => {
    const header = (n: number) => `feat: ${"a".repeat(n - 6)}`;
    expect(rules(header(100))).toEqual([]);
    expect(rules(header(101))).toEqual(["commit-length"]);
    expect(rules("feat: add x.")).toEqual(["commit-header"]);
  });

  it("test_ca_20_blank_line_and_refs", () => {
    expect(rules("feat: x\nbody")).toEqual(["commit-blank-line"]);
    expect(rules("feat: x\n\nbody")).toEqual([]);
    expect(rules("feat: x\n\nRefs: spec-06, JIRA-1")).toEqual([]);
    expect(rules("feat: x\n\nRefs:")).toEqual(["commit-refs"]);
    expect(rules("feat: x\n\nRefs:   ")).toEqual(["commit-refs"]);
  });

  it("test_ca_21_merge_and_language", () => {
    expect(rules(`Merge branch 'develop' into x\n${"long ".repeat(60)}`)).toEqual([]);
    expect(rules("feat(cli): adiciona o comando de validação")).toEqual([]);
    expect(rules("feat(cli): add the validation command")).toEqual([]);
  });

  it("test_ca_20_fixtures_crlf_and_lines", () => {
    const valid = readFileSync(join(FIXTURES, "valid.txt"), "utf8");
    expect(validateCommit(valid, "m")).toEqual([]);
    expect(validateCommit(valid.replace(/\n/g, "\r\n"), "m")).toEqual([]);
    const invalid = readFileSync(join(FIXTURES, "invalid.txt"), "utf8");
    expect(validateCommit(invalid, "m.txt").map((i) => `${i.path} ${i.rule}`)).toEqual([
      "m.txt:1 commit-header",
      "m.txt:1 commit-header",
      "m.txt:2 commit-blank-line",
      "m.txt:3 commit-refs",
    ]);
  });
});
