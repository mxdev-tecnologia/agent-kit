# Spec 01b — CI and community files

- **Status:** em andamento
- **Nível:** lite
- **Risco:** médio
- **Depende de:** spec-01a
- **Épico:** agent-kit v1
- **Branch:** feature/spec-01b-ci-community
- **Jira:** —
- **PR:** —
- **Versão:** —
- **ADR:** nenhum
- **Contexto:** `docs/sdd/01a-cli-foundation.md`, `docs/INSTRUCTIONS.md`, `.claude/workflow.md`

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)

## Context
Delivery validation escalates to spec-validator (sensitive paths: package.json, .github/workflows/).

Merge order: spec 01a must be merged before spec 01b. If 01a renames any script, 01b must follow the new name.

Spec 01a created the CLI and the local gate. This spec runs the same gate in GitHub Actions on every pull request, keeps dependencies fresh with Dependabot, and adds the community files a public repository needs (`CONTRIBUTING.md`, `SECURITY.md`). The workflow is hardened from the start because the package will be installed through `npx` in many projects.

## Functional requirements
- **RF-01:** WHEN a pull request targets `develop` or `main`, or a push lands on `develop`, THE CI SHALL run install (`--frozen-lockfile`), then the scripts `lint`, `typecheck`, `test`, `build`, `check --self` and `test:smoke` (the names defined in spec 01a) on `ubuntu-latest` (Node 22 and 24) and `windows-latest` (Node 22).
- **RF-02:** WHEN any step fails, THE CI SHALL fail the workflow so that the pull request shows a failed check.
- **RF-03:** WHEN a newer version of a GitHub Action or devDependency exists, THE SYSTEM SHALL have Dependabot open a weekly pull request targeting `develop`.
- **RF-04:** THE SYSTEM SHALL provide a `CONTRIBUTING.md` that describes setup, the SDD flow (specs in `docs/sdd`, approval before implementation), branch and commit conventions (`<type>(<scope>): description` in pt-BR) and the language rule (agent-facing Markdown in English).
- **RF-05:** THE SYSTEM SHALL provide a `SECURITY.md` that explains private vulnerability reporting through GitHub Security Advisories, the supported versions and the expected response time.

## Non-functional requirements
- **RNF-01 (security):** the workflow has top-level `permissions: contents: read`; every third-party action is pinned to a full 40-character commit SHA with a version comment; the trigger is `pull_request` (never `pull_request_target`); the workflow uses no secrets. Verified by `tests/ci-policy.test.ts` (regex over the workflow file; no YAML dependency).
- **RNF-02 (cost / performance):** the workflow has a concurrency group per ref with `cancel-in-progress`, and a full run takes under 10 minutes (verified on the first PR run).
- **RNF-03 (reliability):** the pnpm version comes from the `packageManager` field (corepack or a pinned pnpm setup action), never from a floating version.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** `.github/workflows/ci.yml`, **When** the policy test reads it, **Then** the triggers are `pull_request` on `develop`/`main` and `push` on `develop`, the matrix has `ubuntu-latest` (Node 22, 24) and `windows-latest` (Node 22), and the steps include install with `--frozen-lockfile`, lint, typecheck, test, build, `check --self` and `test:smoke`. *Verification:* test `tests/ci-policy.test.ts`
- **CA-02** (RF-02) — **Given** the workflow steps, **When** the policy test inspects them, **Then** no step uses `continue-on-error: true`. *Verification:* test `tests/ci-policy.test.ts`
- **CA-03** (RF-03) — **Given** `.github/dependabot.yml`, **When** the policy test reads it, **Then** it declares the `github-actions` and `npm` ecosystems with a weekly schedule and `target-branch: develop`. *Verification:* test `tests/ci-policy.test.ts`
- **CA-04** (RF-04) — **Given** `CONTRIBUTING.md`, **When** reviewed, **Then** it covers setup, the SDD flow, branch and commit conventions and the language rule. *Verification:* manual (read the file against the RF)
- **CA-05** (RF-05) — **Given** `SECURITY.md`, **When** reviewed, **Then** it covers private reporting through GitHub Security Advisories, supported versions and response time. *Verification:* manual (read the file against the RF)
- **CA-06** (RNF-01) — **Given** the workflow file, **When** the policy test runs, **Then** it finds top-level `permissions: contents: read`, every non-local `uses:` pinned to a 40-character SHA followed by a version comment, no `pull_request_target` and no `secrets.` reference. *Verification:* test `tests/ci-policy.test.ts`
- **CA-07** (RNF-02) — **Given** the workflow file, **When** the policy test runs, **Then** a `concurrency` group per ref with `cancel-in-progress: true` exists; and **When** the first PR run finishes, **Then** its total duration is under 10 minutes. *Verification:* test `tests/ci-policy.test.ts` and manual (check the duration on the first PR run)
- **CA-08** (RNF-03) — **Given** the workflow file, **When** the policy test runs, **Then** pnpm comes from `packageManager` (corepack) or a pinned setup action and no step installs `pnpm@latest`. *Verification:* test `tests/ci-policy.test.ts`
- **CA-09** (RF-01, RF-02) — **Given** the PR of this spec, **When** the CI finishes, **Then** the three matrix legs show green checks. The CI steps mirror exactly the spec 01a scripts (`lint`, `typecheck`, `test`, `build`, `check --self`, `test:smoke`). *Verification:* manual (checks tab of the PR)

## Design
**Files (closed list — this is the write authorization):**
- `.github/workflows/ci.yml` — the CI workflow
- `.github/dependabot.yml` — `github-actions` and `npm`, weekly, `target-branch: develop`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `tests/ci-policy.test.ts` — regex checks over the workflow and Dependabot files
- Docs: `README.md` (short "Contributing" and "Security" links), `docs/INSTRUCTIONS.md` (CI section)

**Decisions:** the workflow follows the hardening rules in RNF-01 to RNF-03; the policy test adds no dependency (plain regex over text).

## Tasks
- [x] `.github/workflows/ci.yml` and `.github/dependabot.yml`
- [x] `CONTRIBUTING.md` and `SECURITY.md`
- [x] `tests/ci-policy.test.ts`
- [x] Docs updated (`README.md`, `docs/INSTRUCTIONS.md`)

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm -s lint                                        # exit 0
pnpm -s typecheck                                   # exit 0
pnpm -s test                                        # all pass, including ci-policy
pnpm -s build                                       # exit 0
node dist/cli.js check --self                       # exit 0, OK summary
pnpm -s test:smoke                                  # all pass, exit 0
```

## Changelog
- **Adicionado:** CI no GitHub Actions (Linux e Windows), Dependabot semanal, `CONTRIBUTING.md` e `SECURITY.md`.
- **Atenção no deploy:** após o merge, habilitar "Private vulnerability reporting" nas configurações do repositório (ação do dono).

## Out of scope
- Publishing to npm and release automation.
- Branch protection rules and required checks configuration.
- Code scanning and other security workflows.

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01, CA-09 | test + manual | `.github/workflows/ci.yml`, `tests/ci-policy.test.ts` | CA-01: `tests/ci-policy.test.ts:17` `test_ca_01_triggers_matrix_and_steps` passes; `ci.yml:3-7` triggers, `:24-30` matrix, `:45-64` steps. CA-09: pending after PR |
| RF-02 | CA-02, CA-09 | test + manual | `.github/workflows/ci.yml`, `tests/ci-policy.test.ts` | CA-02: `tests/ci-policy.test.ts:37` passes (mutation `continue-on-error: true` and `lint \|\| true` make it fail); `ci.yml:22` `fail-fast: false` keeps each leg reporting. CA-09: pending after PR |
| RF-03 | CA-03 | test | `.github/dependabot.yml`, `tests/ci-policy.test.ts` | `tests/ci-policy.test.ts:41` passes; `.github/dependabot.yml:3-12` |
| RF-04 | CA-04 | manual | `CONTRIBUTING.md` | Manual review by validator: setup `CONTRIBUTING.md:5`, SDD flow `:22`, branches `:31`, commits pt-BR `:37-39`, language rule `:45` |
| RF-05 | CA-05 | manual | `SECURITY.md` | Manual review by validator: GitHub Security Advisories `SECURITY.md:3-8`, supported versions `:12`, response time `:20` |
| RNF-01 | CA-06 | test | `.github/workflows/ci.yml`, `tests/ci-policy.test.ts` | `tests/ci-policy.test.ts:52` passes (mutations `pull_request_target` and `@v7` make it fail); `ci.yml:9-10`, `:33`, `:38`; SHAs confirmed with `gh api` as the commits of tags v7.0.1 / v7.0.0; `persist-credentials: false` `ci.yml:35` |
| RNF-02 | CA-07 | test + manual | `.github/workflows/ci.yml`, `tests/ci-policy.test.ts` | Concurrency: `tests/ci-policy.test.ts:66` passes; `ci.yml:12-14`; `timeout-minutes: 15` `ci.yml:20`. Duration under 10 min: pending after PR |
| RNF-03 | CA-08 | test | `.github/workflows/ci.yml`, `tests/ci-policy.test.ts` | `tests/ci-policy.test.ts:72` passes; `ci.yml:42-43` corepack + `package.json` `packageManager: pnpm@12.7.0` |

## Execution notes
No deviations. pnpm via corepack (`packageManager`); actions pinned: checkout v7.0.1, setup-node v7.0.0 (published more than 14 days ago). Pending after the PR: RNF-02 duration under 10 minutes and CA-09 green checks on the three matrix legs.

## Validation report
### Delivery validation (2026-10-11)
```
MODO: B · VEREDITO: APROVADO · VALIDADOR: spec-validator (Opus high)
SMOKE: OK (test:smoke 1/1; gate re-run: test 18/18, ci-policy 6/6)
ACHADOS:
- [importante] tests/ci-policy.test.ts:53 — adding a job-level `permissions: write-all` under `ci.yml:19` keeps all 6 tests green (mutation confirmed), so a future edit can grant write access without the policy test noticing → assert a single `permissions:` block (or no `write` anywhere). Non-blocking: the current workflow meets RNF-01.
CA SEM EVIDÊNCIA: nenhum   · MANUAIS: CA-04, CA-05 (reviewed, OK); CA-07 (duration) and CA-09 pending after PR
DECISÃO HUMANA NECESSÁRIA: nenhuma
```
Notes:
- Actions pins verified with `gh api`: `actions/checkout` tag v7.0.1 -> 3d3c42e5aac5ba805825da76410c181273ba90b1; `actions/setup-node` tag v7.0.0 -> 820762786026740c76f36085b0efc47a31fe5020 (both tags point directly to these commits).
- Hardening: top-level `contents: read`, `pull_request` only, no `secrets.`, `persist-credentials: false`, no `continue-on-error`, concurrency per ref, job timeout 15 min.
- Scope: besides the Design list, the branch touches `docs/ARCHITECTURE.md` (one layout line for `.github/`, living-docs rule, in allowlist) and lifecycle fields in `docs/sdd/README.md` and `docs/sdd/01a-cli-foundation.md`. Accepted; all inside the docs allowlist.
- Commits follow `<type>(<scope>): <pt-BR>` with `Refs: spec-01b`.
- After merge (owner): enable "Private vulnerability reporting" so the `SECURITY.md` flow works.
