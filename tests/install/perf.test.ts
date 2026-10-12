import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  doInit,
  makePackage,
  makeProject,
  put,
  skillMd,
} from "../fixtures/install/helpers.js";

afterEach(cleanup);

describe("perf", () => {
  it("test_ca_37_init_of_60_files_median_under_2s", () => {
    const pkg = makePackage();
    for (let i = 0; i < 18; i++) {
      put(pkg, `catalog/skills/skill-${i}/SKILL.md`, skillMd(`skill-${i}`));
      put(pkg, `catalog/skills/skill-${i}/references/a.md`, "a\n");
      put(pkg, `catalog/skills/skill-${i}/references/b.md`, "b\n");
    }
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const root = makeProject();
      const start = performance.now();
      expect(doInit(root, pkg).code).toBe(0);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const limit = process.platform === "win32" ? 8000 : 2000;
    expect(times[2]).toBeLessThan(limit);
  });
});
