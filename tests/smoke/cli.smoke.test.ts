import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cli = join(process.cwd(), "dist", "cli.js");
const limitMs = process.env.CI ? 1000 : 300;

describe("smoke: built CLI", () => {
  it("test_ca_08_version_median_under_limit", () => {
    expect(existsSync(cli), "run `pnpm build` first").toBe(true);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const r = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
      times.push(performance.now() - start);
      expect(r.status).toBe(0);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(limitMs);
  });
});
