# Specs — agent-kit

Spec-driven development plan for the public agent-kit repository. Each spec lives in `docs/sdd/NN-slug.md`, is approved before implementation, and is delivered through a pull request to `develop`.

## Lifecycle

`planned` → `draft` → `review` → `approved` → `in progress` → `in PR` → `delivered` → `released`

- **planned:** listed below, no spec file yet.
- **draft / review:** spec file exists; the validator reviews requirements (EARS), NFRs and acceptance criteria.
- **approved:** the owner approved the spec, including execution mode (sequential or parallel) and agent count.
- **delivered:** PR merged into `develop`.
- **released:** shipped in a tagged npm version.

## Epic: agent-kit v1

Goal: a public, provider-neutral SDD brain that installs with one `npx` command into Claude Code, Codex and Antigravity projects, with deterministic validators and versioned JSON schemas.

| Spec | Title | Depends on | Level | Status |
|---|---|---|---|---|
| spec-01 | Foundation: repository layout, TypeScript CLI skeleton, lint, tests, build, CI, CONTRIBUTING and SECURITY | — | lite | planned |
| spec-02 | Contracts: `cortex.*/v1` JSON Schemas and the frontmatter format for agents, skills, workflows and rules | spec-01 | full | planned |
| spec-03 | Installer: `agent-kit init`, `update`, `sync` and `check`; CLI detection, per-provider install, `agent-kit.lock.json`, merge with `.agents/local/`, name-collision checks | spec-02 | full | planned |
| spec-04 | SDD brain: skills, workflows and rules (original content, in English) | spec-02 | lite | planned |
| spec-05 | Agents: 13 roles with full job titles, and the provider catalog (Claude Code, Codex, Antigravity, any OpenAI-compatible endpoint) with concurrency limits | spec-02 | lite | planned |
| spec-06 | Validators: `agent-kit validate spec`, `tasks`, `commit`, `verdict` | spec-02 | lite | planned |
| spec-07 | Publishing: `@mxdev-tecnologia/agent-kit` on npm with provenance from GitHub Actions; `next` pre-releases from `develop` | spec-03, spec-06 | full | planned |

Suggested order: spec-01 → spec-02 → spec-03, spec-04, spec-05 and spec-06 in parallel → spec-07.

## Consumers

- Downstream projects pin a kit version in `agent-kit.lock.json` and start using it once `agent-kit init` (spec-03) is available.

## Roadmap

- More CLIs (adapters only need a target path map and a collision list).
- Optional MCP server that serves skills on demand.
- Domain packs beyond software: content (strategist, researcher, copywriter, editor, SEO, fact-checker), marketing and social media, and executive direction. Packs reuse the same contracts; the work item becomes a brief, a campaign or a decision.
