import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli.js";

const FIX = join(import.meta.dirname, "..", "fixtures", "validate");
const ROOT = join(import.meta.dirname, "..", "..");
const tmp = () => mkdtempSync(join(tmpdir(), "validate-"));

function run(args: string[], stdin?: string) {
  let out = "";
  let err = "";
  const code = main(args, {
    out: (t) => (out += t),
    err: (t) => (err += t),
    ...(stdin === undefined ? {} : { stdin: () => stdin }),
  });
  return { code, out, err };
}

const validFiles: Record<string, string> = {
  spec: join(FIX, "spec", "valid.md"),
  tasks: join(FIX, "envelope", "plan.valid.json"),
  verdict: join(FIX, "envelope", "verdict.valid.json"),
  envelope: join(FIX, "envelope", "task.valid.json"),
  commit: join(FIX, "commit", "valid.txt"),
};
const invalidSpec = join(FIX, "spec", "missing-sections.md");

describe("validate command", () => {
  it.each(Object.keys(validFiles))("test_ca_01_%s_file_and_stdin", (kind) => {
    const file = validFiles[kind] as string;
    const a = run(["validate", kind, file]);
    expect(a.code).toBe(0);
    expect(a.out).toMatch(/^OK: /);
    const b = run(["validate", kind, "-"], readFileSync(file, "utf8"));
    expect(b.code).toBe(0);
    expect(b.out).toBe(`OK: ${kind} valid (<stdin>)\n`);
  });

  it("test_ca_01_built_cli_when_present", () => {
    const cli = join(ROOT, "dist", "cli.js");
    if (!existsSync(cli)) return;
    const r = spawnSync(process.execPath, [cli, "validate", "spec", "-"], {
      input: readFileSync(validFiles.spec as string),
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
  });

  it("test_ca_02_exit_codes", () => {
    const cases: [string[], number][] = [
      [["validate", "spec", validFiles.spec as string], 0],
      [["validate", "spec", invalidSpec], 1],
      [["validate", "bogus", "x"], 2],
      [["validate", "spec"], 2],
      [["validate", "spec", validFiles.spec as string, "--bogus"], 2],
      [["validate", "spec", join(tmpdir(), "does-not-exist.md")], 2],
    ];
    for (const [args, code] of cases) {
      const r = run(args);
      expect(r.code, args.join(" ")).toBe(code);
      if (code === 2) {
        expect(r.err).toContain("Error:");
        expect(r.err).toContain("Usage:");
      }
    }
  });

  it("test_ca_03_json_and_text_output", () => {
    const j = run(["validate", "spec", invalidSpec, "--json"]);
    expect(j.err).toBe("");
    const parsed = JSON.parse(j.out) as { valid: boolean; errors: Record<string, string>[] };
    expect(Object.keys(parsed)).toEqual(["valid", "errors"]);
    expect(parsed.valid).toBe(false);
    expect(Object.keys(parsed.errors[0] as object)).toEqual(["path", "rule", "message"]);
    expect(j.out.endsWith("\n")).toBe(true);
    expect(j.out.trimEnd().includes("\n")).toBe(false);
    const t = run(["validate", "spec", invalidSpec]);
    expect(t.out).toBe("");
    for (const line of t.err.trimEnd().split("\n")) {
      expect(line).toMatch(/^.+:\d+: spec-section: .+/);
    }
    const ok = run(["validate", "spec", validFiles.spec as string, "--json"]);
    expect(JSON.parse(ok.out)).toEqual({ valid: true, errors: [] });
  });

  it("test_ca_04_cap_and_path_formats", () => {
    const rows = Array.from({ length: 80 }, () => "- **RF-01:** THE SYSTEM SHALL a.");
    const spec = ["- **Status:** x", "## Functional requirements", ...rows, ""].join("\n");
    const r = run(["validate", "spec", "-", "--json"], spec);
    const parsed = JSON.parse(r.out) as { errors: { path: string }[] };
    expect(parsed.errors).toHaveLength(50);
    expect(parsed.errors.every((e) => e.path.startsWith("<stdin>:"))).toBe(true);
    const file = join(tmp(), "s.md");
    writeFileSync(file, spec);
    const f = JSON.parse(run(["validate", "spec", file, "--json"]).out) as {
      errors: { path: string }[];
    };
    expect(f.errors[0]?.path).toBe(`${file}:4`);

    const ids = Array.from({ length: 80 }, () => ({
      id: "a",
      title: "t",
      assignee: "b",
      depends_on: [],
      acceptance: ["CA-01"],
    }));
    const plan = JSON.parse(readFileSync(validFiles.tasks as string, "utf8"));
    plan.body = { mode: "parallel", max_agents: 2, steps: ids };
    const e = JSON.parse(run(["validate", "tasks", "-", "--json"], JSON.stringify(plan)).out) as {
      errors: { path: string }[];
    };
    expect(e.errors).toHaveLength(50);
    expect(e.errors.every((x) => x.path === "" || x.path.startsWith("/"))).toBe(true);
  });

  it("test_ca_05_schemas_folder_option", () => {
    const dir = tmp();
    const plan = JSON.parse(
      readFileSync(join(ROOT, "schemas", "cortex", "plan.schema.json"), "utf8"),
    );
    plan.properties.work_item = { type: "string", const: "other" };
    mkdirSync(join(dir, "cortex"), { recursive: true });
    for (const f of readdirSync(join(ROOT, "schemas"), { recursive: true }) as string[]) {
      if (!f.endsWith(".schema.json")) continue;
      const src =
        f === join("cortex", "plan.schema.json")
          ? plan
          : JSON.parse(readFileSync(join(ROOT, "schemas", f), "utf8"));
      mkdirSync(join(dir, f, ".."), { recursive: true });
      writeFileSync(join(dir, f), JSON.stringify(src));
    }
    const file = validFiles.tasks as string;
    expect(run(["validate", "tasks", file, "--schemas", dir]).code).toBe(1);
    expect(run(["validate", "tasks", file]).code).toBe(0);
    expect(run(["validate", "tasks", file, "--schemas", join(dir, "missing")]).code).toBe(2);
  });

  it("test_ca_06_too_large", () => {
    const dir = tmp();
    for (const [kind, name] of [
      ["spec", "a.md"],
      ["tasks", "a.json"],
      ["commit", "a.txt"],
      ["envelope", "b.json"],
    ] as const) {
      const file = join(dir, name);
      writeFileSync(file, "x".repeat(1024 * 1024 + 1));
      const r = run(["validate", kind, file, "--json"]);
      expect(r.code).toBe(1);
      expect(
        (JSON.parse(r.out) as { errors: { rule: string }[] }).errors.map((e) => e.rule),
      ).toEqual(["too-large"]);
    }
    const ok = join(dir, "exact.txt");
    writeFileSync(ok, `feat: ${"a".repeat(10)}`);
    expect(run(["validate", "commit", ok]).code).toBe(0);
  });

  it("test_ca_25_stable_output_lf_crlf", () => {
    const lf = readFileSync(invalidSpec, "utf8");
    const crlf = lf.replace(/\n/g, "\r\n");
    const outs = [lf, lf, crlf, crlf].map((t) => run(["validate", "spec", "-", "--json"], t).out);
    expect(new Set(outs).size).toBe(1);
  });

  it("test_ca_27_messages_quote_at_most_80_chars", () => {
    const long = "y".repeat(10_000);
    const spec = ["- **Status:** x", "## Functional requirements", `- **RF-01:** ${long}`, ""].join(
      "\n",
    );
    const r = run(["validate", "spec", "-", "--json"], spec);
    for (const e of (JSON.parse(r.out) as { errors: { message: string }[] }).errors) {
      expect(e.message.length).toBeLessThan(200);
      expect(e.message).not.toContain("y".repeat(81));
    }
    const env = JSON.parse(readFileSync(validFiles.tasks as string, "utf8"));
    env.work_item = long;
    env.body.steps[0].id = long;
    const j = run(["validate", "tasks", "-", "--json"], JSON.stringify(env));
    expect(j.out).not.toContain("y".repeat(81));
    expect(j.code).toBe(1);
  });
});

describe("validate and installer options stay apart", () => {
  it.each([["--force"], ["--dry-run"], ["--cli", "claude"], ["--self"]])(
    "test_merge_validate_rejects_installer_option_%s",
    (...flag) => {
      const r = run(["validate", "spec", validFiles.spec as string, ...flag]);
      expect(r.code).toBe(2);
      expect(r.err).toContain("does not apply to validate");
    },
  );

  it.each([
    ["sync", "--json"],
    ["check", "--schemas", "x"],
  ])("test_merge_installer_rejects_validate_option_%s_%s", (...args) => {
    const r = run(args);
    expect(r.code).toBe(2);
    expect(r.err).toContain("belongs to validate");
  });
});
