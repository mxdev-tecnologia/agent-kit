# Instructions — agent-kit

> Not published yet. Commands below describe the planned interface (spec-03 and spec-07).

## Use in a project

```bash
npx @mxdev-tecnologia/agent-kit init      # detect CLIs and install the brain
npx @mxdev-tecnologia/agent-kit update    # merge a newer version, keeping .agents/local/
npx @mxdev-tecnologia/agent-kit check     # fail on drift or name collisions
```

## Develop the kit

Requirements: Node.js 22+ and pnpm. Setup, lint, test and build commands are defined by spec-01.

## Repository conventions

- Work follows the SDD plan in `docs/sdd/README.md` and a PR-based gitflow (`develop` integrates, `main` holds releases).
- Agent-facing Markdown is written in English; commits, PRs and the CHANGELOG are in pt-BR.
