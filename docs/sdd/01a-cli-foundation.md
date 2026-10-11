# Spec 01a — CLI foundation: toolchain and command skeleton

- **Status:** em PR (#2)
- **Nível:** lite
- **Risco:** médio
- **Depende de:** —
- **Épico:** agent-kit v1
- **Branch:** feature/spec-01a-cli-foundation
- **Jira:** —
- **PR:** #2
- **Versão:** —
- **ADR:** ADR-0001
- **Contexto:** `docs/adr/0001-typescript-cli-zero-runtime-deps.md`, `docs/sdd/README.md`, `.claude/workflow.md` (project gate and smoke)

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)

## Context
Delivery validation escalates to spec-validator (sensitive paths: package.json, .github/workflows/).

This is the first code in the repository. It sets up the toolchain (Node, TypeScript, Biome, Vitest, pnpm) and a minimal `agent-kit` CLI so the project gate in `.claude/workflow.md` works: `pnpm --silent lint; pnpm --silent typecheck; pnpm --silent test; pnpm --silent build; node dist/cli.js check --self`, plus the smoke `pnpm --silent test:smoke`.

The Design lists many trivial files (configs, `.gitkeep` placeholders, a generated lockfile). The real code is 3 source files (`src/cli.ts`, `src/commands/check-self.ts`, `src/version.ts`) and 4 test files.

## Functional requirements
- **RF-01:** WHEN `agent-kit --version` (or `-v`) runs, THE SYSTEM SHALL print exactly the version from `package.json` and exit 0.
- **RF-02:** WHEN `agent-kit --help`, `-h`, or no arguments is given, THE SYSTEM SHALL print usage listing the available commands and options and exit 0.
- **RF-03:** WHEN an unknown command or option is given, THE SYSTEM SHALL print an error plus usage to stderr and exit 2.
- **RF-04:** WHEN `agent-kit check --self` runs in a directory that satisfies all repository invariants, THE SYSTEM SHALL print an OK summary and exit 0. Invariants: the files `README.md`, `LICENSE`, `AGENTS.md`, `CLAUDE.md`, `VERSION`, `CHANGELOG.md` and `package.json` exist; the trimmed content of `VERSION` equals the `package.json` version; the directories `catalog/agents`, `catalog/skills`, `catalog/workflows`, `catalog/rules` and `schemas` exist.
- **RF-05:** WHEN any invariant fails, THE SYSTEM SHALL list every failure (one per line, with the path) and exit 1.
- **RF-06:** WHEN `--root <dir>` is passed to `check --self`, THE SYSTEM SHALL check that directory instead of the current one.

## Non-functional requirements
- **RNF-01 (security / supply chain):** `package.json` has no `dependencies` (or it is empty) and all `devDependencies` use exact versions (no `^` or `~`). Verified by a unit test reading `package.json` (covers only "no dependencies" and "exact versions").
- **RNF-02 (performance):** `node dist/cli.js --version` has a median wall time under 300 ms over 5 runs locally, and under 1000 ms when `process.env.CI` is set, measured by the smoke test (the test applies the same limits).
- **RNF-03 (compatibility):** paths are built with `node:path`; `src/` has no POSIX-only shell calls (Windows CI comes in spec 01b).
- **RNF-04 (quality):** `pnpm --silent lint` and `pnpm --silent typecheck` report zero errors.
- **RNF-05 (supply chain, release age):** each new devDependency version was published at least 14 days before implementation.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** a built CLI, **When** `--version` or `-v` runs, **Then** stdout is exactly the `package.json` version and the exit code is 0. *Verification:* test `tests/cli.test.ts`
- **CA-02** (RF-02) — **Given** a built CLI, **When** run with `--help`, `-h` or no arguments, **Then** usage lists `check`, `--version` and `--help` and the exit code is 0. *Verification:* test `tests/cli.test.ts`
- **CA-03** (RF-03) — **Given** a built CLI, **When** run with an unknown command or option, **Then** stderr has an error plus usage, stdout is empty and the exit code is 2. *Verification:* test `tests/cli.test.ts`
- **CA-04** (RF-04) — **Given** a temp directory with all required files, matching `VERSION`/`package.json` and all required directories, **When** `check --self --root <dir>` runs, **Then** it prints an OK summary and exits 0. *Verification:* test `tests/check-self.test.ts`
- **CA-05** (RF-05) — **Given** a temp directory missing several files and with a `VERSION` mismatch, **When** `check --self --root <dir>` runs, **Then** every failure is listed on its own line with its path and the exit code is 1. *Verification:* test `tests/check-self.test.ts`
- **CA-06** (RF-06) — **Given** the current directory is not valid and another directory is valid, **When** `check --self --root <valid dir>` runs, **Then** the valid directory is checked and the exit code is 0. *Verification:* test `tests/check-self.test.ts`
- **CA-07** (RNF-01) — **Given** the repository `package.json`, **When** the policy test runs, **Then** there are no runtime dependencies and no devDependency uses `^` or `~`. *Verification:* test `tests/package-policy.test.ts`
- **CA-08** (RNF-02) — **Given** a built `dist/`, **When** `node dist/cli.js --version` runs 5 times, **Then** the median wall time is under 300 ms locally, or under 1000 ms when `process.env.CI` is set. *Verification:* test `tests/smoke/cli.smoke.test.ts` via `pnpm --silent test:smoke`
- **CA-09** (RNF-03) — **Given** the sources in `src/`, **When** the commands below run, **Then** no shell calls exist and `node:path` is used where paths are built. *Verification:* command `! grep -rnE "child_process|execSync|spawn" src` and `grep -rn "node:path" src` (matches in the files that build paths)
- **CA-10** (RNF-04) — **Given** the final code, **When** `pnpm --silent lint` and `pnpm --silent typecheck` run, **Then** both exit 0 with zero errors. *Verification:* command `pnpm --silent lint && pnpm --silent typecheck`
- **CA-11** (RNF-05) — **Given** the pinned devDependency versions, **When** `npm view <pkg> time --json` is checked for each of `typescript`, `@biomejs/biome`, `vitest` and `@types/node`, **Then** each pinned version was published at least 14 days before the implementation date, and the result is recorded in the Execution notes. *Verification:* command `npm view <pkg> time --json`

## Design
**Files (closed list — this is the write authorization):**
- `.claude/workflow.md` — (a) the Docs allowlist gains the root files `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`; (b) the Gate gains `pnpm --silent typecheck` (order: lint, typecheck, test, build, `check --self`)
- `docs/adr/README.md` — ADR-0001 in the index
- `docs/adr/0001-typescript-cli-zero-runtime-deps.md` — the ADR
- `package.json` — name `@mxdev-tecnologia/agent-kit`, version `0.1.0` (= `VERSION`), `type: module`, `bin: {"agent-kit": "dist/cli.js"}`, `engines`, `packageManager` (pinned), `files: [dist, catalog, schemas, LICENSE, README.md]`, scripts `build`, `typecheck`, `lint`, `format`, `test`, `test:smoke`; no publish config yet
- `pnpm-lock.yaml` — generated
- `tsconfig.json` — strict, `module`/`moduleResolution` NodeNext, target ES2023, output to `dist/`
- `biome.json` — lint and format
- `vitest.config.ts` — the default run excludes `tests/smoke`
- `src/cli.ts` — shebang, `parseArgs`, dispatch, exit codes
- `src/commands/check-self.ts` — repository invariants check
- `src/version.ts` — reads `package.json` at runtime, relative to the built file
- `catalog/agents/.gitkeep`, `catalog/skills/.gitkeep`, `catalog/workflows/.gitkeep`, `catalog/rules/.gitkeep`, `schemas/.gitkeep`
- `tests/cli.test.ts`, `tests/check-self.test.ts` (temp dirs via `--root`), `tests/package-policy.test.ts`, `tests/smoke/cli.smoke.test.ts` (runs the built `dist` with `child_process`)
- Docs: `AGENTS.md` (Commands section), `docs/INSTRUCTIONS.md` ("Develop the kit": `corepack enable`, `pnpm install`, scripts), `docs/ARCHITECTURE.md` (layout including `src/commands`), `docs/sdd/README.md` (spec-01 row replaced by 01a and 01b; add a line mapping the English lifecycle words to the tooling Status values: rascunho, aprovada, em andamento, validada, em PR, entregue, publicada)

**Decisions:**
- Node >= 22 (`engines`), ESM, TypeScript strict (`module`/`moduleResolution` NodeNext, target ES2023), build with `tsc` to `dist/`.
- pnpm via corepack, with the `packageManager` field pinned.
- Biome for lint and format; Vitest for tests.
- Zero runtime dependencies; argument parsing with `node:util` `parseArgs`.
- New devDependencies, pinned to exact versions, each published at least 14 days before implementation: `typescript`, `@biomejs/biome`, `vitest`, `@types/node`.
- Exit codes: 0 success, 1 check failure, 2 usage error.

## Tasks
- [x] Toolchain configs (`package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`) and lockfile
- [x] `src/version.ts`, `src/cli.ts` and `src/commands/check-self.ts`
- [x] Placeholder directories (`catalog/*`, `schemas`)
- [x] Tests for the CA (including the smoke)
- [x] `.claude/workflow.md` updated (allowlist and gate)
- [x] Docs updated (`AGENTS.md`, `docs/INSTRUCTIONS.md`, `docs/ARCHITECTURE.md`, `docs/sdd/README.md`)

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm --silent lint                                        # exit 0
pnpm --silent typecheck                                   # exit 0
pnpm --silent test                                        # all pass
pnpm --silent build                                       # exit 0
node dist/cli.js check --self                       # exit 0, OK summary
pnpm --silent test:smoke                                  # all pass, exit 0
```

## Changelog
- **Adicionado:** CLI `agent-kit` com `--version`, `--help` e `check --self`; ferramentas de build, lint e testes.
- **Atenção no deploy:** nenhuma

## Out of scope
- The `init`, `update`, `sync` and `validate` commands.
- Schema content and catalog content.
- CI (spec 01b).
- Publishing.

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `src/cli.ts`, `src/version.ts`, `tests/cli.test.ts` | `tests/cli.test.ts:16` (`--version`, `-v`; stdout exato); `node dist/cli.js -v` → `0.1.0`, exit 0 |
| RF-02 | CA-02 | test | `src/cli.ts`, `tests/cli.test.ts` | `tests/cli.test.ts:22` (`--help`, `-h`, sem args) |
| RF-03 | CA-03 | test | `src/cli.ts`, `tests/cli.test.ts` | `tests/cli.test.ts:30` (`bogus`, `--bogus`, `check` sem `--self`; stdout vazio, exit 2); `node dist/cli.js --bogus` → exit 2 |
| RF-04 | CA-04 | test | `src/commands/check-self.ts`, `tests/check-self.test.ts` | `tests/check-self.test.ts:35`; `node dist/cli.js check --self` no repo → OK, exit 0 |
| RF-05 | CA-05 | test | `src/commands/check-self.ts`, `tests/check-self.test.ts` | `tests/check-self.test.ts:42` (11 linhas = 5 arquivos + 5 dirs + VERSION mismatch, exit 1) |
| RF-06 | CA-06 | test | `src/cli.ts`, `src/commands/check-self.ts`, `tests/check-self.test.ts` | `tests/check-self.test.ts:53` (`--root` inválido → 1 com cwd válido; `--root` válido → 0). |
| RNF-01 | CA-07 | test | `package.json`, `tests/package-policy.test.ts` | `tests/package-policy.test.ts:10`; `package.json` sem `dependencies`, 4 devDeps exatas |
| RNF-02 | CA-08 | test (smoke) | `src/cli.ts`, `tests/smoke/cli.smoke.test.ts` | `tests/smoke/cli.smoke.test.ts:10` via `pnpm --silent test:smoke` OK (local e `CI=1`) |
| RNF-03 | CA-09 | command | `src/**` | `! grep -rnE "child_process\|execSync\|spawn" src` → nenhum; `node:path` em `src/cli.ts:3`, `src/version.ts:2`, `src/commands/check-self.ts:2` |
| RNF-04 | CA-10 | command | `.claude/workflow.md`, `biome.json`, `tsconfig.json`, `src/**`, `tests/**` | `pnpm --silent lint` (11 arquivos, 0 erros) e `pnpm --silent typecheck` → exit 0 |
| RNF-05 | CA-11 | command | `package.json`, `pnpm-lock.yaml` | `npm view` reconferido em 2026-10-10: typescript 7.0.2 (07-08), biome 2.5.14 (09-16), vitest 5.0.1 (09-15), @types/node 24.19.0 (09-25), pnpm 12.7.0 (`packageManager`, 09-25) — todas ≥ 14 dias; lockfile só com registry npm e integrity |

## Execution notes
Implementation date: 2026-10-10 (cutoff for 14 days: 2026-09-26). `npm view <pkg> time --json`, pinned version:
- `typescript` 7.0.2 — published 2026-07-08 (95 days)
- `@biomejs/biome` 2.5.14 — published 2026-09-16 (24 days)
- `vitest` 5.0.1 — published 2026-09-15 (25 days)
- `@types/node` 24.19.0 — published 2026-09-25 (15 days; matches the Node 24 dev runtime)
- `packageManager`: `pnpm@12.7.0` — published 2026-09-25 (15 days); `pnpm@12.11.2` was rejected because it was published less than 14 days before.

Decisions:
- `vitest.config.ts` skips `tests/smoke` unless an argv entry contains `smoke`; `test:smoke` passes the folder explicitly.
- `src/cli.ts` exports `main(argv, io)` so unit tests run without a build (the Gate runs `test` before `build`); the entry point runs only when the file is executed directly (symlink-safe via `realpathSync`).
- `tsconfig.json` includes only `src`; tests are linted by Biome and run by Vitest, not type-checked by `tsc`.
- `check` without `--self` is treated as a usage error (exit 2).
- `docs/adr/README.md` and the ADR status were left as `proposed` (acceptance is the owner's call).

## Validation report
Modo A — ciclo 1: ESCALAR/ajustes aplicados; ciclo 2: APROVADO (spec-checker). Risco médio: validação da entrega pelo spec-validator.

Modo B — ciclo 1 (0c5fa69): APROVADO com 3 achados importantes (pnpm 12.11.2 com 1 dia, smoke sem `/health`, `validated` fora do ciclo de vida), todos corrigidos em 6451b8b, fd79868, 6e594ee e fe3d1a6.

Modo B — ciclo 2:
```
MODO: B · VEREDITO: APROVADO · VALIDADOR: spec-validator (Opus high)
SMOKE: OK (smoke.sh: http.server com /health + pnpm --silent test:smoke; também CI=1)
ACHADOS: nenhum
CA SEM EVIDÊNCIA: nenhum   · MANUAIS: nenhum
DECISÃO HUMANA NECESSÁRIA: nenhuma
```
- Gate e Aceite reexecutados: `pnpm install --frozen-lockfile`, lint, typecheck, test, build e `check --self` → exit 0.
- Desvio aceito: o pnpm 12.7.0 rejeita `-s` (`error: unexpected argument '-s'`, exit 2, reproduzido), então todos os `pnpm -s` viraram `pnpm --silent` no workflow.md, AGENTS.md, INSTRUCTIONS e nesta spec (Context, RNF-04, CA-10, Aceite). A troca é mecânica e não muda a semântica de nenhum RF, RNF ou CA. Não sobrou nenhum `pnpm -s` no repo.
- Lockfile: só mudaram as entradas do pnpm (12.11.2 → 12.7.0), com integrity; nenhum host fora do registry npm.
- Escopo: os arquivos do ciclo 2 estão todos no Design. A seção Smoke do workflow.md muda além do item (a)/(b) do Design, como recomendado no ciclo 1.
- Observação: cada execução do smoke deixa um diretório `mktemp -d` com `health` em `/tmp` (`.claude/workflow.md:61`); é inofensivo.
