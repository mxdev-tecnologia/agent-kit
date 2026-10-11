# agent-kit — instructions for agents

This repository builds **agent-kit**, a portable SDD brain (skills, agents, workflows, rules, JSON schemas, validators) installed into other projects through `npx @mxdev-tecnologia/agent-kit`.

> Status: planning. The plan and specs live in `docs/sdd/`.

## Conventions

- All Markdown read by agents (this file, skills, agent definitions, workflows, rules, specs) is written in English. Commits, PR titles and bodies, and the CHANGELOG are in pt-BR.
- Content is original and provider-neutral: never reference a specific model inside skills or agents.
- Names must not collide with built-in commands of Claude Code, Codex or Antigravity (`agent-kit check` enforces this).
- The CLI and validators are written in TypeScript and run with Node.js 22+ through `npx`; no Python dependency.
- Gitflow by pull request: `develop` is the integration branch, `main` holds releases. Never push directly to `develop` or `main`.
- Commit format: `<type>(<scope>): <description in pt-BR>`, types `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `security`.

## Security

- This repository is public. Never add secrets, private project names, internal URLs or personal data.
- Releases are published only from CI with npm provenance.

## Commands

```bash
corepack enable && pnpm install --frozen-lockfile   # setup
pnpm -s lint                                        # Biome
pnpm -s typecheck                                   # tsc --noEmit
pnpm -s test                                        # Vitest (unit)
pnpm -s build                                       # tsc to dist/
node dist/cli.js check --self                       # repository invariants
pnpm -s test:smoke                                  # smoke tests against dist/
```
