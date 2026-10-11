import { configDefaults, defineConfig } from "vitest/config";

// The default run skips tests/smoke (they need a built dist/);
// `pnpm test:smoke` passes the folder explicitly and re-enables them.
const smokeRequested = process.argv.some((arg) => arg.includes("smoke"));

export default defineConfig({
  test: {
    exclude: smokeRequested
      ? configDefaults.exclude
      : [...configDefaults.exclude, "tests/smoke/**"],
  },
});
