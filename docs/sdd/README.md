# Specs — agent-kit

Spec-driven development plan for the public agent-kit repository. Each spec lives in `docs/sdd/NN-slug.md`, is approved before implementation, and is delivered through a pull request to `develop`.

## Lifecycle

`planned` → `draft` → `review` → `approved` → `in progress` → `validated` → `in PR` → `delivered` → `released`

In the tooling, the Status column of each spec file uses the Portuguese values: rascunho (draft), aprovada (approved), em andamento (in progress), validada (validated), em PR (in PR), entregue (delivered), publicada (released).

- **planned:** listed below, no spec file yet.
- **draft / review:** spec file exists; the validator reviews requirements (EARS), NFRs and acceptance criteria.
- **approved:** the owner approved the spec, including execution mode (sequential or parallel) and agent count.
- **delivered:** PR merged into `develop`.
- **released:** shipped in a tagged npm version.

## Epic: agent-kit v1

Goal: a public, provider-neutral SDD brain that installs with one `npx` command into Claude Code, Codex and Antigravity projects, with deterministic validators and versioned JSON schemas.

| Spec | Title | Depends on | Level | Status |
|---|---|---|---|---|
| spec-01a | CLI foundation: toolchain (Node, TypeScript, Biome, Vitest, pnpm) and the `agent-kit` command skeleton (`--version`, `--help`, `check --self`) | — | lite | delivered |
| spec-01b | CI and community files: GitHub Actions workflow, Dependabot, CONTRIBUTING and SECURITY | spec-01a | lite | delivered |
| spec-02a | Contracts core: JSON Schema subset validator, schema registry, common definitions and the frontmatter format for agents, skills, workflows and rules | spec-01a | full | delivered |
| spec-02b | Cortex envelopes: the nine `cortex.*/v1` JSON Schemas | spec-02a | full | approved |
| spec-03 | Installer: `agent-kit init`, `update`, `sync` and `check`; CLI detection, per-provider install, `agent-kit.lock.json`, merge with `.agents/local/`, name-collision checks | spec-02b | full | planned |
| spec-04 | SDD brain: skills, workflows and rules (original content, in English) | spec-02a | lite | planned |
| spec-05 | Agents: 13 roles with full job titles, and the provider catalog (Claude Code, Codex, Antigravity, any OpenAI-compatible endpoint) with concurrency limits | spec-02a | lite | planned |
| spec-06 | Validators: `agent-kit validate spec`, `tasks`, `commit`, `verdict` | spec-02b | lite | planned |
| spec-07 | Publishing: `@mxdev-tecnologia/agent-kit` on npm with provenance from GitHub Actions; `next` pre-releases from `develop` | spec-03, spec-06 | full | planned |

Suggested order: spec-01a → spec-01b → spec-02a → spec-02b → spec-03 and spec-06 (spec-04 and spec-05 only need spec-02a, so they can start as soon as it is merged) → spec-07.

## Consumers

- Downstream projects pin a kit version in `agent-kit.lock.json` and start using it once `agent-kit init` (spec-03) is available.

## Roadmap

- More CLIs (adapters only need a target path map and a collision list).
- Optional MCP server that serves skills on demand.
- Domain packs beyond software: content (strategist, researcher, copywriter, editor, SEO, fact-checker), marketing and social media, and executive direction. Packs reuse the same contracts; the work item becomes a brief, a campaign or a decision.
