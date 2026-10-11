import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

const pkgVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string })
  .version;

function run(args: string[]) {
  let out = "";
  let err = "";
  const code = main(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe("cli", () => {
  it.each([["--version"], ["-v"]])("test_ca_01_version_%s", (flag) => {
    const r = run([flag]);
    expect(r.out).toBe(`${pkgVersion}\n`);
    expect(r.code).toBe(0);
  });

  it.each([["--help"], ["-h"], []])("test_ca_02_help_%j", (...args) => {
    const r = run(args.flat());
    expect(r.out).toContain("check");
    expect(r.out).toContain("--version");
    expect(r.out).toContain("--help");
    expect(r.code).toBe(0);
  });

  it.each([["bogus"], ["--bogus"], ["check"]])("test_ca_03_usage_error_%s", (arg) => {
    const r = run([arg]);
    expect(r.out).toBe("");
    expect(r.err).toContain("Error:");
    expect(r.err).toContain("Usage:");
    expect(r.code).toBe(2);
  });
});
