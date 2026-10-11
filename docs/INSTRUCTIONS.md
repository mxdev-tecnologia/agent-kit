# Instructions — agent-kit

> Not published yet. Commands below describe the planned interface (spec-03 and spec-07).

## Use in a project

```bash
npx @mxdev-tecnologia/agent-kit init      # detect CLIs and install the brain
npx @mxdev-tecnologia/agent-kit update    # merge a newer version, keeping .agents/local/
npx @mxdev-tecnologia/agent-kit check     # fail on drift or name collisions
```

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

## Repository conventions

- Work follows the SDD plan in `docs/sdd/README.md` and a PR-based gitflow (`develop` integrates, `main` holds releases).
- Agent-facing Markdown is written in English; commits, PRs and the CHANGELOG are in pt-BR.
