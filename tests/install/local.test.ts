import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  doInit,
  doSync,
  doUpdate,
  exists,
  installed,
  listFiles,
  localRule,
  makePackage,
  makeProject,
  put,
  read,
  skillMd,
  snapshot,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("local additions", () => {
  it("test_ca_15_additions_are_generated_and_sources_untouched", () => {
    const pkg = makePackage();
    const root = makeProject();
    put(root, ".agents/local/skills/my-skill/SKILL.md", skillMd("my-skill"));
    put(root, ".agents/local/skills/my-skill/references/r.md", "Ref.\n");
    put(root, ".agents/local/rules/team.md", localRule("team"));
    const local = () =>
      Object.fromEntries(
        Object.entries(snapshot(root)).filter(
          ([p]) => p.startsWith(".agents/local/") && !p.endsWith("local"),
        ),
      );
    const before = local();
    expect(doInit(root, pkg).code).toBe(0);
    for (const run of [doUpdate, doSync]) expect(run(root, pkg).code).toBe(0);
    expect(local()).toEqual(before);
    expect(exists(root, ".claude/skills/my-skill/references/r.md")).toBe(true);
    expect(exists(root, ".agents/skills/my-skill/SKILL.md")).toBe(true);
    const agents = read(root, "AGENTS.md");
    expect(agents).toContain("`my-skill`");
    expect(agents).toContain("Local body team.");
    expect(JSON.parse(read(root, "agent-kit.lock.json")).files).toHaveProperty(
      ".agents/skills/my-skill/SKILL.md",
    );
  });

  it("test_ca_15_invalid_frontmatter_and_name_mismatch_are_reported_with_path", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    put(root, ".agents/local/rules/bad.md", "---\nformat: agent-kit/v1\nname: bad\n---\nx\n");
    put(root, ".agents/local/rules/other.md", localRule("different"));
    const before = snapshot(root);
    const r = doSync(root, pkg);
    expect(r.code).toBe(1);
    expect(r.err).toContain(".agents/local/rules/bad.md");
    expect(r.err).toContain(".agents/local/rules/other.md");
    expect(snapshot(root)).toEqual(before);
  });

  it("test_ca_16_symlinks_and_secrets_are_refused", (ctx) => {
    const pkg = makePackage();
    const root = installed(pkg);
    const outside = makeProject();
    put(outside, "secret.txt", "TOPSECRET");
    put(root, ".agents/local/skills/s/SKILL.md", skillMd("s"));
    put(root, ".agents/local/.env.local", "TOPSECRET");
    put(root, ".agents/local/id_rsa", "TOPSECRET");
    try {
      symlinkSync(join(outside, "secret.txt"), join(root, ".agents/local/skills/s/references/key"));
    } catch {
      ctx.skip();
      return;
    }
    const before = snapshot(root);
    const r = doSync(root, pkg);
    expect(r.code).toBe(1);
    for (const p of [
      ".agents/local/.env.local",
      ".agents/local/id_rsa",
      ".agents/local/skills/s/key",
    ]) {
      expect(r.err).toContain(p);
    }
    expect(snapshot(root)).toEqual(before);
    for (const f of listFiles(root).filter((f) => !f.startsWith(".agents/local/"))) {
      expect(read(root, f)).not.toContain("TOPSECRET");
    }
  });

  it("test_ca_16_secret_name_patterns_are_case_insensitive_and_prefix_based", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    put(root, ".agents/local/skills/s/SKILL.md", skillMd("s"));
    const names = [".envrc", ".env-prod", ".env_local", "ID_RSA"];
    for (const n of names) put(root, `.agents/local/skills/s/references/${n}`, "TOPSECRET");
    const r = doSync(root, pkg);
    expect(r.code).toBe(1);
    for (const n of names) expect(r.err).toContain(`references/${n}`);
  });

  it("test_ca_17_names_colliding_with_kit_native_or_reserved", () => {
    const pkg = makePackage();
    const root = installed(pkg);
    put(root, ".agents/local/skills/planning/SKILL.md", skillMd("planning"));
    put(root, ".agents/local/skills/review/SKILL.md", skillMd("review"));
    put(root, ".agents/local/skills/nul/SKILL.md", skillMd("nul"));
    const before = snapshot(root);
    const r = doSync(root, pkg);
    expect(r.code).toBe(1);
    expect(r.err).toContain(".agents/local/skills/planning/SKILL.md");
    expect(r.err).toContain("cannot be overridden");
    expect(r.err).toContain(".agents/local/skills/review/SKILL.md");
    expect(r.err).toContain(".agents/local/skills/nul/SKILL.md");
    expect(snapshot(root)).toEqual(before);
  });
});
