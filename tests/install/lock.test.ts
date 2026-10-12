import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareVersions, hashContent } from "../../src/install/lock.js";
import {
  cleanup,
  doCheck,
  doInit,
  doSync,
  doUpdate,
  installed,
  listFiles,
  makePackage,
  makeProject,
  put,
  read,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("lock", () => {
  it("test_ca_21_lock_format_and_block_hash", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    const text = read(root, "agent-kit.lock.json");
    expect(text.endsWith("}\n")).toBe(true);
    const lock = JSON.parse(text);
    expect(Object.keys(lock)).toEqual(["format", "version", "clis", "files"]);
    expect(lock.format).toBe("agent-kit-lock/v1");
    expect(lock.version).toBe("1.0.0");
    expect(lock.clis).toEqual(["antigravity", "claude", "codex"]);
    const keys = Object.keys(lock.files);
    expect(keys).toEqual([...keys].sort());
    expect(text).toContain('\n  "format"');
    for (const k of keys) expect(k).not.toContain("\\");
    const agents = read(root, "AGENTS.md");
    const block = agents.slice(
      "<!-- agent-kit:begin -->\n".length,
      agents.indexOf("\n<!-- agent-kit:end -->"),
    );
    expect(lock.files["AGENTS.md"]).toBe(hashContent(Buffer.from(block)));
    expect(lock.files["CLAUDE.md"]).toBe(hashContent(Buffer.from("@AGENTS.md")));
    expect(lock.files[".agents/rules/style.md"]).toBe(
      hashContent(Buffer.from(read(root, ".agents/rules/style.md"))),
    );
  });

  it("test_ca_22_crlf_nul_and_mode", () => {
    expect(hashContent(Buffer.from("a\r\nb\n"))).toBe(hashContent(Buffer.from("a\nb\n")));
    const bin = Buffer.from([1, 0, 13, 10]);
    expect(hashContent(bin)).not.toBe(hashContent(Buffer.from([1, 0, 10])));
    const root = makeProject();
    put(root, "f", "x");
    const a = hashContent(Buffer.from("x"));
    if (process.platform !== "win32") chmodSync(join(root, "f"), 0o755);
    expect(hashContent(Buffer.from(read(root, "f")))).toBe(a);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });

  const BAD_LOCKS: Record<string, string | null> = {
    missing: null,
    "invalid json": "{ nope",
    "key outside prefixes": JSON.stringify({
      format: "agent-kit-lock/v1",
      version: "1.0.0",
      clis: ["claude"],
      files: { "package.json": `sha256-${"0".repeat(64)}` },
    }),
  };

  it.each(Object.entries(BAD_LOCKS))("test_ca_24_lock_%s", (_n, content) => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, "package.json", "{}");
    if (content !== null) put(root, "agent-kit.lock.json", content);
    const before = snapshot(root);
    for (const run of [doUpdate, doSync, doCheck]) {
      const r = (run as typeof doCheck)(root, pkg);
      expect(r.code).toBe(1);
      expect(r.err).toContain("agent-kit.lock.json");
    }
    expect(snapshot(root)).toEqual(before);
  });

  it("test_ca_38_crlf_sources_give_identical_output", () => {
    const lf = makePackage();
    const crlf = makePackage();
    for (const rel of [
      "catalog/skills/planning/SKILL.md",
      "catalog/skills/planning/references/guide.md",
      "catalog/workflows/ship.md",
      "catalog/rules/style.md",
    ]) {
      put(crlf, rel, read(crlf, rel).replace(/\n/g, "\r\n"));
    }
    const a = installed(lf);
    const b = installed(crlf);
    expect(read(b, "agent-kit.lock.json")).toBe(read(a, "agent-kit.lock.json"));
    for (const f of listFiles(a)) expect(read(b, f), f).toBe(read(a, f));
  });

  it("test_ca_38_crlf_tree_checks_clean_and_syncs_with_zero_writes", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    for (const f of listFiles(root).filter((p) => p !== "agent-kit.lock.json")) {
      writeFileSync(join(root, f), read(root, f).replace(/\n/g, "\r\n"));
    }
    writeFileSync(
      join(root, "agent-kit.lock.json"),
      read(root, "agent-kit.lock.json").replace(/\n/g, "\r\n"),
    );
    expect(doCheck(root, pkg).code).toBe(0);
    const before = snapshot(root);
    const r = doSync(root, pkg);
    expect(r.code).toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  it("test_ca_21_init_does_not_list_the_lock_itself", () => {
    const pkg = makePackage();
    const root = makeProject();
    doInit(root, pkg);
    expect(Object.keys(JSON.parse(read(root, "agent-kit.lock.json")).files)).not.toContain(
      "agent-kit.lock.json",
    );
  });
});
