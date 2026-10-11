# ADR-0001 — TypeScript CLI with zero runtime dependencies

- **Status:** proposed
- **Date:** 2026-10-10
- **Origin:** spec-01a
- **Supersedes:** —

## Context
agent-kit is a public package installed through `npx` into many projects, so a compromised dependency would reach all of them: supply-chain risk is the main constraint. The CLI must also run on Linux, macOS and Windows without requiring Python or any other runtime on the target machine, and `npx` start-up must be fast.

## Decision
- Write the CLI in TypeScript (strict) as ESM, targeting Node >= 22.
- Build with `tsc` to `dist/`.
- Parse arguments with `node:util` `parseArgs`.
- Use Biome for lint and format, and Vitest for tests.
- Manage packages with pnpm through corepack (`packageManager` pinned).
- Declare **no runtime dependencies**. Every devDependency uses an exact version.
- Forbidden: adding a runtime dependency without a new ADR.

## Consequences
- **Positive:** small attack surface; fast `npx` start; the lockfile and dependency review stay small.
- **Negative / costs:** some helpers (for example, subcommand help or prompts) are written by hand.
- **What changes in code or operation:** `package.json` has no `dependencies`, enforced by a unit test (spec 01a, RNF-01); the toolchain is defined in spec 01a.

## Alternatives considered
| Alternative | Why not |
|---|---|
| commander / yargs | Convenient, but a runtime dependency; `parseArgs` is enough for now. |
| ESLint + Prettier | Two tools and many more dependencies; Biome covers both. |
| tsup / esbuild | A bundler is not needed yet; plain `tsc` is enough. |
| Python CLI | Requires Python on the target machine. |
