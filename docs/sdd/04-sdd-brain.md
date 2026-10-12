# Spec 04 — SDD brain: workflows, skills and rules

- **Status:** em PR (#13)
- **Nível:** lite
- **Risco:** médio
- **Depende de:** spec-02a, spec-02b
- **Épico:** agent-kit v1
- **Branch:** feature/spec-04-sdd-brain
- **Jira:** —
- **PR:** #13
- **Versão:** —
- **ADR:** —
- **Contexto:** `docs/ARCHITECTURE.md`, `docs/sdd/02a-contracts-core.md`, `docs/sdd/02b-cortex-envelopes.md`, `docs/sdd/03-installer.md`, `docs/sdd/05-agents-providers.md`, `docs/sdd/06-validators.md`, `AGENTS.md`

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)

## Context
This spec writes the content of the kit: the procedures (workflows), the reusable knowledge (skills) and the always-on guardrails (rules) that make up the spec-driven development method. All content is original, written in English, provider-neutral, and valid against the frontmatter schemas of spec-02a. The files live in `catalog/` and are installed into projects by the installer (spec-03).

Delivery validation is done by spec-checker (level "lite"; content only, no code or schema change).

**Parallel execution (Merge order).** Specs 03, 04, 05 and 06 run in parallel from `develop`. This spec touches only `catalog/{workflows,skills,rules}/`, its own tests and fixtures, and nothing in `src/`, `schemas/` or `check-self.ts`. Its names must stay out of the collision list of spec-03 (`src/catalog/collisions.ts`); spec-03 verifies that in `check --self` after the merge, and this spec's own test checks the same list (copied into the test as a constant). The workflows refer to agent ids defined by spec-05 (see Design); this spec does not need the agent files to exist, only the ids. The spec format produced by the `spec` workflow is exactly what `agent-kit validate spec` (spec-06) accepts; the two specs carry the same "Spec format rules" text (see Design). Docs: only `README.md` is affected (RF-17); `docs/ARCHITECTURE.md` already describes the `catalog/` layout, so no change is needed there.

## Functional requirements
**Workflows**
- **RF-01:** THE SYSTEM SHALL provide exactly thirteen workflows in `catalog/workflows/<name>.md`: `triage`, `spec`, `design`, `tasks`, `build`, `verify`, `ship`, `sync`, `ui-lanes`, `debug`, `critique`, `learn` and `progress`.
- **RF-02:** THE SYSTEM SHALL write each workflow with the sections Objective, Inputs, Steps, Outputs and Human stops, in that order.
- **RF-03:** THE SYSTEM SHALL give each workflow frontmatter with `format: agent-kit/v1`, `name` equal to the file name, `description`, `argument-hint` and `agents` (a list of agent ids from the set in Design, at least one).
- **RF-04:** WHERE a workflow emits envelopes, THE SYSTEM SHALL name them in its Outputs section as `cortex.<kind>/v1` with a kind among the nine envelopes of spec-02b.
- **RF-05:** THE SYSTEM SHALL state in each workflow the conditions in which it stops and asks the human (changes of scope, design, contract or data model; conflicts between spec and code; new dependencies; destructive operations).
- **RF-06:** THE SYSTEM SHALL describe in the `spec` workflow a spec document with the headings and id prefixes defined in Design, "Spec format", so that `agent-kit validate spec` (spec-06) accepts it.

**Skills**
- **RF-07:** THE SYSTEM SHALL provide exactly ten skills in `catalog/skills/<name>/SKILL.md`: `ears-requirements`, `acceptance-criteria`, `task-breakdown`, `traceability`, `verification-evidence`, `context-budget`, `git-flow`, `security-audit`, `project-memory` and `design-lanes`.
- **RF-08:** THE SYSTEM SHALL give each skill frontmatter with `format: agent-kit/v1`, `name` equal to the folder name and a `description` that says what the skill does and when to use it.
- **RF-09:** WHERE a skill needs long material (templates, checklists, examples), THE SYSTEM SHALL put it in short files under `references/` and link them from `SKILL.md`.
- **RF-10:** THE SYSTEM SHALL provide in `catalog/skills/ears-requirements/references/` a complete minimal spec example that follows the Spec format of Design.

**Rules**
- **RF-11:** THE SYSTEM SHALL provide exactly six rules in `catalog/rules/<name>.md`: `language`, `scope-discipline`, `human-in-the-loop`, `no-secrets`, `evidence-before-done` and `commit-format`.
- **RF-12:** THE SYSTEM SHALL write the `commit-format` rule with the format `<type>(<scope>): <description>`, the types `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore` and `security`, and a scope of lowercase letters, digits and hyphens, matching what `agent-kit validate commit` (spec-06) accepts.
- **RF-13:** THE SYSTEM SHALL write the `language` rule so that documents read by agents are in English and leave the language of commits and user-facing text to the project.

**Cross-cutting**
- **RF-14:** THE SYSTEM SHALL write all catalog content in English, original, and SHALL NOT name any model, vendor or CLI product in a skill, workflow or rule (denylist of spec-02a, RF-20).
- **RF-15:** THE SYSTEM SHALL keep all workflow and skill names distinct from each other (one namespace) and absent from the native-command lists and the reserved Windows names of spec-03.
- **RF-16:** WHEN `agent-kit check --self` runs on the repository with this content, THE SYSTEM SHALL exit 0.

**Docs**
- **RF-17:** THE SYSTEM SHALL update the Skills row of `README.md` so that it lists the ten skills of the catalog, and SHALL state in the delivery that no other doc is affected.

## Non-functional requirements
- **RNF-01 (maintainability / size):** each `SKILL.md` has at most 500 lines and each `description` at most 1024 characters. Verified by a test over the catalog.
- **RNF-02 (compatibility / format):** no catalog file lacks frontmatter, and every file validates against its frontmatter schema with `name` equal to the file or folder name. Verified by a test and by `check --self`.
- **RNF-03 (provider neutrality):** zero denylisted words (spec-02a list) in `catalog/skills`, `catalog/workflows` and `catalog/rules`, including `references/`. Verified by a scanning test with a self-test that catches a planted word.
- **RNF-04 (compatibility / names):** zero collisions with the lists of spec-03 and zero repeated names between skills and workflows. Verified by the same test.
- **RNF-05 (usability):** each workflow has at most 150 lines, so an agent can load it whole. Verified by a test.
- Security, LGPD, performance, cost, authorization: none. The change is static Markdown with no endpoint or data; the `no-secrets` rule and the `security-audit` skill carry the guidance, not code.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** `catalog/workflows/`, **When** the test lists it, **Then** it holds exactly the thirteen expected names and nothing else. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-02** (RF-02) — **Given** each workflow, **When** the test reads the headings, **Then** Objective, Inputs, Steps, Outputs and Human stops appear in that order. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-03** (RF-03) — **Given** each workflow, **When** the frontmatter is parsed and validated, **Then** it passes the workflow schema, `name` equals the file name, `argument-hint` is present, and every `agents` item belongs to the thirteen ids (constant in the test: `orchestrator`, `scout`, `planner`, `architect`, `builder`, `verifier`, `reviewer`, `ui-designer`, `doc-writer`, `runner`, `security`, `releaser`, `observer`). *Verification:* test `tests/catalog-brain.test.ts`
- **CA-04** (RF-04) — **Given** each workflow body, **When** the test extracts `cortex.<kind>/v1` tokens, **Then** every kind is one of the nine envelopes; **And** `build`, `verify`, `tasks`, `design` and `learn` each name at least one envelope. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-05** (RF-05) — **Given** each workflow, **When** the Human stops section is read, **Then** it is non-empty and lists at least one stop condition. *Verification:* test `tests/catalog-brain.test.ts` (non-empty section) and manual (read the conditions)
- **CA-06** (RF-06, RF-10) — **Given** the `spec` workflow and the example in `catalog/skills/ears-requirements/references/`, **When** the test checks the example against the Spec format rules of Design (headings, id patterns, EARS start and `SHALL`, Given/When/Then, matrix rows), **Then** it passes, with no dependency on spec-06 code. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-07** (RF-06, RF-10) — **Given** spec-06 is merged into `develop`, **When** `node dist/cli.js validate spec catalog/skills/ears-requirements/references/spec-example.md` runs, **Then** it exits 0. *Verification:* manual pendente (command run in `/sdd-sync` after the merge of spec-06)
- **CA-08** (RF-07) — **Given** `catalog/skills/`, **When** the test lists it, **Then** it holds exactly the ten expected folders, each with a `SKILL.md`. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-09** (RF-08) — **Given** each skill, **When** its frontmatter is validated, **Then** it passes the skill schema, `name` equals the folder name and `description` is non-empty. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-10** (RF-09) — **Given** each skill with a `references/` folder, **When** the test reads `SKILL.md`, **Then** every file in `references/` is linked from it. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-11** (RF-11) — **Given** `catalog/rules/`, **When** the test lists it, **Then** it holds exactly the six rule files `language`, `scope-discipline`, `human-in-the-loop`, `no-secrets`, `evidence-before-done`, `commit-format`, each valid against the rule schema. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-12** (RF-12) — **Given** the `commit-format` rule, **When** the test reads its body, **Then** it contains the format string, all ten types and the scope pattern. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-13** (RF-13) — **Given** the `language` rule, **When** reviewed, **Then** it requires English for documents read by agents and leaves the language of commits and user-facing text to the project. *Verification:* manual (read the rule)
- **CA-14** (RF-14, RNF-03) — **Given** the files under `catalog/skills`, `catalog/workflows` and `catalog/rules`, **When** the test scans every word against the denylist of spec-02a, **Then** none matches; **And** a self-test with a planted denylisted word is caught. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-15** (RF-15, RNF-04) — **Given** all workflow, skill and rule names, **When** the test compares them with each other, with the collision lists (constant in the test, same values as spec-03, frozen at its approval) and with the reserved Windows names (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`), **Then** there are no repeats, no collisions and no reserved names. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-16** (RF-16, RNF-02) — **Given** the repository, **When** `node dist/cli.js check --self` runs, **Then** it exits 0. *Verification:* command `pnpm --silent build && node dist/cli.js check --self`
- **CA-17** (RNF-01) — **Given** every `SKILL.md`, **When** the test counts lines and description length, **Then** lines ≤ 500 and description ≤ 1024. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-18** (RNF-05) — **Given** every workflow, **When** the test counts lines, **Then** each has at most 150. *Verification:* test `tests/catalog-brain.test.ts`
- **CA-19** (RF-17) — **Given** `README.md`, **When** reviewed, **Then** the Skills row lists the ten skills of the catalog and no other README row or doc is changed by this spec. *Verification:* manual (read `README.md` against the RF)

## Design
**Files (closed list — this is the write authorization):**
- `catalog/workflows/{triage,spec,design,tasks,build,verify,ship,sync,ui-lanes,debug,critique,learn,progress}.md`
- `catalog/skills/{ears-requirements,acceptance-criteria,task-breakdown,traceability,verification-evidence,context-budget,git-flow,security-audit,project-memory,design-lanes}/SKILL.md`
- `catalog/skills/<name>/references/*.md` (short; at least `ears-requirements/references/spec-example.md`)
- `catalog/rules/{language,scope-discipline,human-in-the-loop,no-secrets,evidence-before-done,commit-format}.md`
- `tests/catalog-brain.test.ts`
- Docs: `README.md` (Skills row of "What is inside"); no other doc is affected (`docs/ARCHITECTURE.md` already describes `catalog/`)
- No change to `src/`, `schemas/`, `package.json` or `check-self.ts` (the collision list is a constant in the test until spec-03 lands).

**Agent ids used by `agents` (defined by spec-05):** `orchestrator`, `scout`, `planner`, `architect`, `builder`, `verifier`, `reviewer`, `ui-designer`, `doc-writer`, `runner`, `security`, `releaser`, `observer`.

**Workflows (purpose, agents, envelopes emitted):**

| Workflow | Purpose | Agents | Envelopes |
|---|---|---|---|
| `triage` | Classify a request (direct, lite, full) and its risk | orchestrator, scout | `cortex.blocked/v1` |
| `spec` | Write a spec in the Spec format and submit it for review | orchestrator, architect, doc-writer, reviewer | `cortex.blocked/v1` |
| `design` | Decide the technical approach and the closed file list | architect, scout | `cortex.design/v1`, `cortex.blocked/v1` |
| `tasks` | Break an approved spec into a plan | planner | `cortex.plan/v1`, `cortex.task/v1` |
| `build` | Implement tasks within the allowed scope | builder, runner | `cortex.result/v1`, `cortex.blocked/v1`, `cortex.handoff/v1` |
| `verify` | Check the result against the criteria, with evidence | verifier, security, runner | `cortex.verdict/v1` |
| `ship` | Update docs, open the pull request, hand over | doc-writer, releaser | `cortex.result/v1` |
| `sync` | Reconcile specs and status after a merge | releaser, doc-writer | `cortex.observation/v1` |
| `ui-lanes` | Explore interface alternatives in parallel lanes | ui-designer, orchestrator | `cortex.design/v1` |
| `debug` | Find the cause of a failure before changing code | scout, builder, runner | `cortex.result/v1`, `cortex.lesson/v1` |
| `critique` | Review a change or document with findings | reviewer, security | `cortex.verdict/v1` |
| `learn` | Record reusable lessons after a run | observer, orchestrator | `cortex.lesson/v1` |
| `progress` | Report status, stalls and budget use | observer | `cortex.observation/v1` |

**Skills (one line each):** `ears-requirements` (write requirements in EARS, with the Spec format and the example); `acceptance-criteria` (Given/When/Then with a verification per criterion); `task-breakdown` (small tasks, dependencies, parallel limits); `traceability` (requirement → criterion → test → evidence matrix); `verification-evidence` (what counts as evidence; no "done" without it); `context-budget` (keep context small: one spec per session, short reports); `git-flow` (branches, pull requests, no direct push, merge by the owner); `security-audit` (checklist for auth, input, secrets, personal data); `project-memory` (record decisions and lessons in the repository, not in chat); `design-lanes` (parallel design alternatives and how to promote one).

**Rules (closed list of six):** `language`, `scope-discipline` (touch only what the spec lists), `human-in-the-loop` (stop and ask in the cases of RF-05), `no-secrets` (never read, print or copy secrets or personal data), `evidence-before-done`, `commit-format`. All six use `always: true`.

**Spec format rules** (copied from spec-06, derived from specs 01a, 01b, 02a and 02b; the two specs must stay identical):
- Header: a line `- **Status:** <value>` before the first `##` heading is required; the other header lines (level, risk, dependencies, branch) are recommended.
- Sections (level-2 headings, exact text): `Functional requirements`, `Non-functional requirements`, `Acceptance criteria`, `Traceability matrix`. Other sections are free.
- Requirement line: `- **RF-NN:**` or `- **RF-NN (label):**` followed by text; same for `RNF`. Bold lines that are not list items (sub-headings such as `**Shared definitions and header**`) are ignored. Continuation lines (indented or non-list) belong to the previous item.
- CA line: `- **CA-NN** (RF-NN, RNF-NN) — **Given** ... **When** ... **Then** ...`; the parenthesis lists the covered requirement ids (aliases accepted).
- Matrix: a Markdown table whose first column is the requirement id and second column the CA ids (comma-separated); header and separator rows are skipped.
- Ids are numeric with at least two digits, unique and sequential from 01 inside each family (`RF`/`FR`, `RNF`/`NFR`, `CA`/`AC`); an alias and its family count as one family.
- EARS check is lexical (first words `THE <subject>`, `WHEN`, `WHILE`, `IF` or `WHERE`, and the word `SHALL`), not a grammar; RNF lines need no EARS check.
- Error paths use the line of the item (or of the section heading).
- The reference spec is `docs/sdd/02b-cortex-envelopes.md`.

**Decisions:**
- The collision list is frozen at the approval of spec-03 and includes the reserved Windows names; the constant in the test mirrors it.
- CA-06 (local test) and CA-07 (command, manual pendente until spec-06 is merged) were split in cycle 1; ids stay numeric and sequential so that `validate spec` accepts this spec.
- Workflows carry procedure; skills carry knowledge; the two never share a name.
- The skill that holds the spec example is `ears-requirements`, to keep the `spec` workflow short.
- The ids in `agents` are checked against a constant until spec-05 is merged; after that the test may read `catalog/agents/` instead (a follow-up, not part of this spec).

## Tasks
- [x] The six rules
- [x] The ten skills with short `references/` (and the spec example)
- [x] The thirteen workflows
- [x] `tests/catalog-brain.test.ts` (names, structure, frontmatter, denylist with self-test, collisions, size limits)
- [x] `check --self` green

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm --silent lint                                  # exit 0
pnpm --silent typecheck                             # exit 0
pnpm --silent test                                  # all pass, including catalog-brain
pnpm --silent build                                 # exit 0
node dist/cli.js check --self                       # exit 0, catalog valid
pnpm --silent test:smoke                            # all pass, exit 0
```

## Changelog
- **Adicionado:** conteúdo do kit SDD: 13 workflows, 10 skills e 6 regras (originais, em inglês, sem referência a modelos).
- **Atenção no deploy:** nenhuma

## Out of scope
- The agent files and the provider catalog (spec-05).
- Installing the content into projects (spec-03).
- The `validate spec` implementation (spec-06); this spec only aligns the format.
- Reading the agent ids from `catalog/agents/` in the test.
- Content in other languages, and domain packs beyond software.

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `catalog/workflows/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-02 | CA-02 | test | `catalog/workflows/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-03 | CA-03 | test | `catalog/workflows/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-04 | CA-04 | test | `catalog/workflows/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-05 | CA-05 | test + manual | `catalog/workflows/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed); manual OK |
| RF-06 | CA-06, CA-07 | test + manual pendente | `catalog/workflows/spec.md`, `catalog/skills/ears-requirements/` | test passed; CA-07 manual pendente |
| RF-07 | CA-08 | test | `catalog/skills/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-08 | CA-09 | test | `catalog/skills/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-09 | CA-10 | test | `catalog/skills/*/references/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-10 | CA-06, CA-07 | test + manual pendente | `catalog/skills/ears-requirements/references/` | test passed; CA-07 manual pendente |
| RF-11 | CA-11 | test | `catalog/rules/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-12 | CA-12 | test | `catalog/rules/commit-format.md`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-13 | CA-13 | manual | `catalog/rules/language.md` | manual OK (catalog/rules/language.md) |
| RF-14 | CA-14 | test | `catalog/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-15 | CA-15 | test | `catalog/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RF-16 | CA-16 | command | `catalog/` | check --self OK |
| RF-17 | CA-19 | manual | `README.md` | manual OK (README.md Skills row) |
| RNF-01 | CA-17 | test | `catalog/skills/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RNF-02 | CA-16 | command | `catalog/` | check --self OK |
| RNF-03 | CA-14 | test | `catalog/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RNF-04 | CA-15 | test | `catalog/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |
| RNF-05 | CA-18 | test | `catalog/workflows/`, `tests/catalog-brain.test.ts` | test tests/catalog-brain.test.ts (passed) |

## Execution notes
- Implemented as designed; no deviations. CA-07 stays manual pending (needs spec-06 merged). CA-13 and CA-19 are manual reviews. Only `README.md` is affected among the docs.

## Validation report
MODE: B · VERDICT: APROVADO (cycle 2)
SMOKE: OK ()
Cycle 1 finding 1 (docs/ARCHITECTURE.md) resolved by c0e1845: diff against origin/develop is empty. Scope: only catalog/{workflows,skills,rules}, README.md, this spec and tests/catalog-brain.test.ts.
CA without evidence: none · MANUAL: CA-05, CA-13, CA-19 OK; CA-07 pending until spec-06 merge.
