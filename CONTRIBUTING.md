# Contributing to agent-kit

Thanks for helping. This guide covers setup, the spec-driven flow, and conventions.

## Setup

Requirements: Node.js 22+ and pnpm (provided by corepack through the `packageManager` field).

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --silent lint
pnpm --silent typecheck
pnpm --silent test
pnpm --silent build
node dist/cli.js check --self
pnpm --silent test:smoke
```

CI runs the same steps on every pull request. They must pass before review.

## Spec-driven flow (SDD)

1. Every change starts with a spec in `docs/sdd/` (requirements, acceptance criteria, design, tasks).
2. The spec must be approved before implementation starts.
3. Implement only the files listed in the spec Design, with one test per testable acceptance criterion.
4. Update the affected docs in the same branch.

Trivial fixes (a few lines, one or two files, no risk) may skip the spec; mention that in the PR.

## Branches

- `develop` is the integration branch; `main` holds releases. Never push directly to either.
- Work on `feature/spec-NN-slug` (or `fix/<slug>`) branched from `develop`, and open a pull request to `develop`.
- Update your branch with a merge from `develop`; do not rebase published branches or force-push.

## Commits and pull requests

Format: `<type>(<scope>): <description>` with the description in Brazilian Portuguese (pt-BR).

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `security`.
- Add a short body and a `Refs: spec-NN` line.
- Pull request titles follow the same format. Do not edit `CHANGELOG.md` or `VERSION`; releases consolidate them.

## Language rule

Markdown that agents read (`AGENTS.md`, skills, agent definitions, workflows, rules, specs, docs) is written in English. Commits, PR titles and bodies, and the CHANGELOG are in pt-BR.

## Content rules

The repository is public: never commit secrets, private project names, internal URLs or personal data. Content must be original and provider-neutral (no specific model names in skills or agents).

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).
