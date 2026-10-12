# Instructions — agent-kit

> Not published yet. Commands below describe the planned interface (spec-03 and spec-07).

## Use in a project

```bash
npx @mxdev-tecnologia/agent-kit init      # detect CLIs and install the brain
npx @mxdev-tecnologia/agent-kit update    # merge a newer version, keeping .agents/local/
npx @mxdev-tecnologia/agent-kit check     # fail on drift or name collisions
```

## Validate specs, plans, verdicts, envelopes and commits

```bash
agent-kit validate <kind> <file|-> [--json] [--schemas <dir>]
```

- `kind`: `spec` (SDD spec structure), `tasks` (`cortex.plan/v1` plus cross-field rules), `verdict` (`cortex.verdict/v1` plus cross-field rules), `envelope` (any `cortex.<kind>/v1`, chosen from the `schema` field) or `commit` (commit message).
- `<file>` is the path to read; `-` reads standard input. Files over 1 MiB are rejected with the rule `too-large`.
- `--json` prints one JSON object to stdout: `{ "valid": boolean, "errors": [ { "path", "rule", "message" } ] }`. Without it, each error is one line `<path>: <rule>: <message>` on stderr and an OK line goes to stdout.
- `--schemas <dir>` loads the schemas from `<dir>`. Without it, the schemas of the installed package are used, never those of the current project.
- At most 50 errors are listed. The path is `file:line` for `spec` and `commit` (`<stdin>` for standard input) and a JSON Pointer for the JSON kinds.
- Exit codes: `0` valid, `1` invalid, `2` usage error (unknown kind, missing argument, unknown option or unreadable file; the usage goes to stderr).

The command only reads; it writes nothing. The rules are listed in `docs/ARCHITECTURE.md` ("Rules the schemas do not encode").

## Develop the kit

Requirements: Node.js 22+ and pnpm (provided by corepack).

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --silent lint          # Biome
pnpm --silent typecheck     # tsc --noEmit
pnpm --silent test          # Vitest, unit tests
pnpm --silent build         # compiles src/ to dist/
node dist/cli.js check --self   # repository invariants
pnpm --silent test:smoke    # smoke tests (need a built dist/)
pnpm --silent format        # Biome formatter
```

CLI exit codes: `0` success, `1` a `check` invariant failed, `2` usage error (unknown command or option, or `check` without `--self`). Until the installer lands (spec-03), `check` only works with `--self` (optionally `--root <dir>`).

`check --self` also loads every schema under `schemas/` and validates the frontmatter of `catalog/` files against them. Each failure is one line with the file path (and the line number for parse errors). The success line ends with the number of catalog files checked: `OK: repository invariants hold (<root>, N catalog files)`.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests to `develop` or `main` and on pushes to `develop`. It installs with `--frozen-lockfile`, then runs `lint`, `typecheck`, `test`, `build`, `check --self` and `test:smoke` on Linux (Node 22 and 24) and Windows (Node 22). pnpm comes from the `packageManager` field through corepack. The workflow has read-only permissions, uses no secrets and pins third-party actions to full commit SHAs; `tests/ci-policy.test.ts` enforces this. Dependabot opens weekly updates for GitHub Actions and npm against `develop`.

## Repository conventions

- Work follows the SDD plan in `docs/sdd/README.md` and a PR-based gitflow (`develop` integrates, `main` holds releases).
- Agent-facing Markdown is written in English; commits, PRs and the CHANGELOG are in pt-BR.
