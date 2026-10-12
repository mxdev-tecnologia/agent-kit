import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateSpec } from "../../src/validate/spec.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "validate", "spec");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const rules = (text: string) => validateSpec(text, "s.md").map((i) => i.rule);

interface Parts {
  fr?: string[];
  nfr?: string[];
  ca?: string[];
  matrix?: string[];
}

/** Builds a spec from the lines of each section (defaults form a valid spec). */
function spec(parts: Parts = {}): string {
  const fr = parts.fr ?? ["- **RF-01:** THE SYSTEM SHALL work."];
  const nfr = parts.nfr ?? ["- **RNF-01 (x):** fast."];
  const ca = parts.ca ?? ["- **CA-01** (RF-01, RNF-01) — **Given** a, **When** b, **Then** c."];
  const matrix = parts.matrix ?? [
    "| R | CA |",
    "|---|---|",
    "| RF-01 | CA-01 |",
    "| RNF-01 | CA-01 |",
  ];
  return [
    "# T",
    "- **Status:** x",
    "## Functional requirements",
    ...fr,
    "## Non-functional requirements",
    ...nfr,
    "## Acceptance criteria",
    ...ca,
    "## Traceability matrix",
    ...matrix,
    "",
  ].join("\n");
}

describe("validate spec", () => {
  it("test_ca_07_valid_fixture_and_structure_errors_with_lines", () => {
    expect(validateSpec(fixture("valid.md"), "v.md")).toEqual([]);

    const noStatus = validateSpec(fixture("missing-status.md"), "f.md");
    expect(noStatus.map((i) => [i.path, i.rule])).toEqual([["f.md:1", "spec-header"]]);

    const noSections = validateSpec(fixture("missing-sections.md"), "f.md");
    const total = fixture("missing-sections.md").split("\n").length - 1;
    expect(noSections.filter((i) => i.rule === "spec-section").map((i) => i.path)).toEqual([
      `f.md:${total}`,
      `f.md:${total}`,
      `f.md:${total}`,
    ]);

    const empty = validateSpec(fixture("empty-section.md"), "f.md");
    expect(empty).toContainEqual({
      path: "f.md:13",
      rule: "spec-section",
      message: expect.stringContaining("Non-functional requirements"),
    });
  });

  it("test_ca_08_ears_starts_and_shall", () => {
    const ok = [
      "THE SYSTEM SHALL a.",
      "WHEN x, THE SYSTEM SHALL a.",
      "WHILE x, THE SYSTEM SHALL a.",
      "IF x, THEN THE SYSTEM SHALL a.",
      "WHERE x, THE SYSTEM SHALL a.",
      "THE CI SHALL a.",
    ].map((t, i) => `- **RF-${String(i + 1).padStart(2, "0")}:** ${t}`);
    const matrix = [
      "| R | CA |",
      "|---|---|",
      ...ok.map((_, i) => `| RF-0${i + 1} | CA-01 |`),
      "| RNF-01 | CA-01 |",
    ];
    const ca = ["- **CA-01** (RF-01, RNF-01) — **Given** a, **When** b, **Then** c."];
    expect(validateSpec(spec({ fr: ok, matrix, ca }), "s.md")).toEqual([]);

    for (const bad of ["The system will work.", "THE SYSTEM does it.", "Something SHALL happen."]) {
      expect(rules(spec({ fr: [`- **RF-01:** ${bad}`] }))).toEqual(["ears"]);
    }
  });

  it("test_ca_09_ids_unique_sequential_and_aliases", () => {
    const dup = ["- **RF-01:** THE SYSTEM SHALL a.", "- **RF-01:** THE SYSTEM SHALL b."];
    expect(rules(spec({ fr: dup }))).toEqual(["duplicate-id"]);
    const gap = ["- **RF-01:** THE SYSTEM SHALL a.", "- **RF-03:** THE SYSTEM SHALL b."];
    const gapMatrix = [
      "| R | CA |",
      "|-|-|",
      "| RF-01 | CA-01 |",
      "| RF-03 | CA-01 |",
      "| RNF-01 | CA-01 |",
    ];
    expect(rules(spec({ fr: gap, matrix: gapMatrix }))).toEqual(
      ["id-sequence", "id-sequence"].slice(0, 1),
    );
    expect(rules(spec({ fr: ["- **RF-02:** THE SYSTEM SHALL a."] }))).toContain("id-sequence");

    const alias = [
      "# T",
      "- **Status:** x",
      "## Functional requirements",
      "- **FR-01:** THE SYSTEM SHALL a.",
      "## Non-functional requirements",
      "- **NFR-01 (x):** fast.",
      "## Acceptance criteria",
      "- **AC-01** (FR-01, NFR-01) — **Given** a, **When** b, **Then** c.",
      "## Traceability matrix",
      "| R | CA |",
      "|-|-|",
      "| FR-01 | AC-01 |",
      "| NFR-01 | AC-01 |",
    ].join("\n");
    expect(validateSpec(alias, "s.md")).toEqual([]);
  });

  it("test_ca_10_given_when_then_and_references", () => {
    const ca = (text: string) => [`- **CA-01** (RF-01, RNF-01) — ${text}`];
    for (const good of [
      "**Given** a, **When** b, **Then** c.",
      "**Dado** a, **Quando** b, **Então** c.",
    ]) {
      expect(rules(spec({ ca: ca(good) }))).toEqual([]);
    }
    for (const bad of [
      "**Given** a, **When** b.",
      "**When** b, **Given** a, **Then** c.",
      "**Then** c.",
    ]) {
      expect(rules(spec({ ca: ca(bad) }))).toEqual(["given-when-then"]);
    }
    expect(
      rules(spec({ ca: ["- **CA-01** (RF-99) — **Given** a, **When** b, **Then** c."] })),
    ).toContain("dangling-ref");
    expect(rules(spec({ ca: ["- **CA-01** — **Given** a, **When** b, **Then** c."] }))).toContain(
      "dangling-ref",
    );
  });

  it("test_ca_11_matrix_rows_and_references", () => {
    const head = ["| R | CA |", "|---|---|"];
    const missingRow = [...head, "| RF-01 | CA-01 |"];
    expect(rules(spec({ matrix: missingRow }))).toEqual(["matrix-coverage"]);
    const noCa = [...head, "| RF-01 | CA-01 |", "| RNF-01 | |"];
    expect(rules(spec({ matrix: noCa }))).toEqual(["matrix-coverage"]);
    const ghostReq = [...head, "| RF-01 | CA-01 |", "| RNF-01 | CA-01 |", "| RF-99 | CA-01 |"];
    expect(rules(spec({ matrix: ghostReq }))).toEqual(["matrix-ref"]);
    const ghostCa = [...head, "| RF-01 | CA-01, CA-99 |", "| RNF-01 | CA-01 |"];
    expect(rules(spec({ matrix: ghostCa }))).toEqual(["matrix-ref"]);
    expect(rules(spec())).toEqual([]);
  });

  it("test_ca_07_issues_are_sorted_by_line_and_use_crlf_and_fences", () => {
    const text = spec({ fr: ["- **RF-02:** nothing", "- **RF-01:** nothing"] });
    const lines = validateSpec(text, "s.md").map((i) => Number(i.path.split(":")[1]));
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(validateSpec(text.replace(/\n/g, "\r\n"), "s.md")).toEqual(validateSpec(text, "s.md"));
    const fenced = spec().replace("## Acceptance", "```\n## Fake\n```\n## Acceptance");
    expect(rules(fenced)).toEqual([]);
  });
});
