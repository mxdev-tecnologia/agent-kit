import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli.js";
import { validateSpec } from "../../src/validate/spec.js";

const LIMIT_MS = process.platform === "win32" ? 800 : 200;

function generated(lines: number): string {
  const n = Math.max(1, Math.floor((lines - 14) / 3));
  const rf = Array.from(
    { length: n },
    (_, i) => `- **RF-${String(i + 1).padStart(2, "0")}:** THE SYSTEM SHALL do thing ${i + 1}.`,
  );
  const ca = Array.from({ length: n }, (_, i) => {
    const id = String(i + 1).padStart(2, "0");
    return `- **CA-${id}** (RF-${id}, RNF-01) — **Given** a, **When** b, **Then** c.`;
  });
  const rows = Array.from({ length: n }, (_, i) => {
    const id = String(i + 1).padStart(2, "0");
    return `| RF-${id} | CA-${id} |`;
  });
  return [
    "- **Status:** x",
    "## Functional requirements",
    ...rf,
    "## Non-functional requirements",
    "- **RNF-01 (x):** y.",
    "## Acceptance criteria",
    ...ca,
    "## Traceability matrix",
    "| R | CA |",
    "|---|---|",
    ...rows,
    "| RNF-01 | CA-01 |",
    "",
  ].join("\n");
}

function median(run: () => void): number {
  for (let i = 0; i < 3; i++) run();
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[2] as number;
}

describe("validate performance and bounds", () => {
  it("test_ca_23_median_under_limit", () => {
    const text = generated(300);
    expect(text.split("\n").length).toBeGreaterThanOrEqual(280);
    expect(validateSpec(text, "s.md")).toEqual([]);
    expect(median(() => validateSpec(text, "s.md"))).toBeLessThan(LIMIT_MS);
    const cli = join(process.cwd(), "dist", "cli.js");
    if (existsSync(cli)) {
      const ms = median(() => {
        spawnSync(process.execPath, [cli, "validate", "spec", "-"], { input: text });
      });
      expect(ms).toBeLessThan(LIMIT_MS * 4);
    }
  });

  it("test_ca_26_pathological_inputs_end_fast_and_write_nothing", () => {
    const before = readdirSync(process.cwd()).sort();
    const spaces = `- **RF-01:** THE${" ".repeat(100_000)}x`;
    const many = Array.from({ length: 10_000 }, (_, i) => `- **RF-${i + 1}:** THE SYSTEM SHALL x.`);
    for (const text of [
      `- **Status:** x\n## Functional requirements\n${spaces}\n`,
      `- **Status:** x\n## Functional requirements\n${many.join("\n")}\n`,
    ]) {
      const start = performance.now();
      const code = main(["validate", "spec", "-", "--json"], {
        out: () => {},
        err: () => {},
        stdin: () => text,
      });
      expect(code).toBe(1);
      expect(performance.now() - start).toBeLessThan(2000);
    }
    expect(readdirSync(process.cwd()).sort()).toEqual(before);
  });
});
