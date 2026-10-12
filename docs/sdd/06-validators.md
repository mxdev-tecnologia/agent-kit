# Spec 06 — Validators: validate spec, tasks, verdict, envelope and commit

- **Status:** em andamento
- **Nível:** lite
- **Risco:** médio
- **Depende de:** spec-02b
- **Épico:** agent-kit v1
- **Branch:** feature/spec-06-validators
- **Jira:** —
- **PR:** —
- **Versão:** —
- **ADR:** —
- **Contexto:** `docs/ARCHITECTURE.md` ("Rules the schemas do not encode"), `docs/sdd/02a-contracts-core.md`, `docs/sdd/02b-cortex-envelopes.md`, `docs/sdd/04-sdd-brain.md`, `docs/adr/0002-own-json-schema-subset-validator.md`, `.claude/workflow.md`

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)

## Context
Agents and people produce specs, plans, verdicts and commit messages. This spec adds `agent-kit validate <kind> <file|->`, deterministic checks that catch mistakes before a human reads them. It enforces the rules that the `cortex.*/v1` schemas deliberately do not encode (RF-14 of spec-02b, listed in `docs/ARCHITECTURE.md`), checks the structure of specs written in the kit's format, and checks commit messages.

Delivery validation is done by spec-checker (level "lite"; read-only commands, no writes, no new dependency).

**Parallel execution (Merge order).** Specs 03, 04, 05 and 06 run in parallel from `develop`. `src/cli.ts` is touched by this spec and by spec-03: each only adds its dispatch branch and its `USAGE` line, and whichever merges second resolves the conflict by merging `develop` into its branch. This spec does not touch `src/commands/check-self.ts` or `catalog/`. Shared docs: `docs/ARCHITECTURE.md` is also edited by spec-03 (Install model, Layout, lock, collisions) and spec-05 ("Provider catalog"), and `docs/INSTRUCTIONS.md` by spec-03; each spec edits only its own section, and the later merge resolves any conflict by merging `develop`. `--root` is the project root in the installer commands (spec-03); here the schemas folder is chosen with `--schemas <dir>`. Spec-04 describes the same spec format as this spec (see Design, "Spec format rules"); the shared headings and id prefixes must stay identical in both.

## Functional requirements
**Command**
- **RF-01:** THE SYSTEM SHALL provide `agent-kit validate <kind> <file|-> [--json] [--schemas <dir>]` for the kinds `spec`, `tasks`, `verdict`, `envelope` and `commit`, reading standard input when the argument is `-`.
- **RF-02:** WHEN the input is valid, THE SYSTEM SHALL exit 0; WHEN it is invalid, exit 1; WHEN the usage is wrong (unknown kind, missing argument, unknown option, unreadable file), exit 2 with an error and the usage on stderr.
- **RF-03:** WHEN `--json` is given, THE SYSTEM SHALL print to stdout exactly `{ "valid": boolean, "errors": [ { "path": string, "rule": string, "message": string } ] }` with the keys in that order and `errors` sorted by position; otherwise it SHALL print one line per error as `<path>: <rule>: <message>` to stderr and an OK line to stdout.
- **RF-04:** THE SYSTEM SHALL report at most 50 errors per run, and each error SHALL carry `file:line` for `spec` and `commit` (`<stdin>` for standard input) or a JSON Pointer for JSON kinds.
- **RF-05:** WHERE `--schemas <dir>` is given, THE SYSTEM SHALL load the schemas from `<dir>`; otherwise it SHALL load them from the installed package (never from the current project).
- **RF-06:** IF an input file is larger than 1 MiB, THEN THE SYSTEM SHALL reject it with the rule `too-large` before parsing.

**Spec**
- **RF-07:** WHEN `validate spec` runs, THE SYSTEM SHALL require a header with `- **Status:**` and the sections `## Functional requirements`, `## Non-functional requirements`, `## Acceptance criteria` and `## Traceability matrix`, each non-empty.
- **RF-08:** THE SYSTEM SHALL require every RF line to start, after the id, with `THE SYSTEM`, `WHEN`, `WHILE`, `IF` or `WHERE` (also accepting `THE` followed by another subject, as in `THE CI SHALL`) and to contain `SHALL`.
- **RF-09:** THE SYSTEM SHALL require ids unique and sequential from 01 within each family (`RF`, `RNF`, `CA`), accepting `FR`, `NFR` and `AC` as aliases of the same families.
- **RF-10:** THE SYSTEM SHALL require every CA to contain Dado/Quando/Então in the Portuguese or English form (`Given`/`When`/`Then`) in that order, and to reference at least one existing RF or RNF id.
- **RF-11:** THE SYSTEM SHALL require the traceability matrix to have one row for every RF and RNF with at least one CA id, and to reference only ids that exist.
- **RF-12:** WHEN `validate spec` runs on every `docs/sdd/[0-9]*.md` of this repository (the real specs 01a, 01b, 02a, 02b and the specs 03 to 06), THE SYSTEM SHALL exit 0.

**Tasks, verdict and envelope**
- **RF-13:** WHEN `validate tasks` runs, THE SYSTEM SHALL validate the input against `cortex.plan/v1` and, in addition, require: `steps[].id` unique; every `depends_on` entry pointing to an existing step id; no dependency cycle; `mode: sequential` with `max_agents` 1; `parent_id` different from `id`.
- **RF-14:** WHEN `validate verdict` runs, THE SYSTEM SHALL validate the input against `cortex.verdict/v1` and, in addition, require: `decision: rejected` with at least one finding of severity `blocker` or `major`; `findings[].id` unique; `parent_id` different from `id`.
- **RF-15:** WHEN `validate envelope` runs, THE SYSTEM SHALL choose the schema from the `schema` field (any of the nine `cortex.<kind>/v1`), validate against it and apply every cross-field rule that applies to that kind: the rules of RF-13 and RF-14, uniqueness of `blocked.options[].id` and of `task.acceptance[].id`, and `parent_id` different from `id` for all kinds.
- **RF-16:** IF the input of `validate tasks` or `validate verdict` has a `schema` of another kind, THEN THE SYSTEM SHALL report the rule `wrong-kind` with the expected value; IF `validate envelope` finds an unknown `schema`, it SHALL report `unknown-schema`; IF the JSON is malformed, it SHALL report `json-parse` with the position.

**Commit**
- **RF-17:** WHEN `validate commit` runs, THE SYSTEM SHALL require the header `<type>(<scope>)?: <description>` with a type among `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `security`, a scope matching `[a-z0-9-]+` when present, and a non-empty description.
- **RF-18:** THE SYSTEM SHALL require the header to have at most 100 characters and a description without a final period.
- **RF-19:** THE SYSTEM SHALL require a blank line between the header and the body, and, when a `Refs:` line exists, require it to have a non-empty value.
- **RF-20:** WHEN a message starts with `Merge `, THE SYSTEM SHALL accept it without further checks.
- **RF-21:** THE SYSTEM SHALL NOT check the language of the message.

**Docs**
- **RF-22:** THE SYSTEM SHALL update `docs/ARCHITECTURE.md` so that "Rules the schemas do not encode" points to the implementation and lists the spec and commit rules, and `docs/INSTRUCTIONS.md` with the command, its kinds, options, exit codes and the `--json` format.

## Non-functional requirements
- **RNF-01 (performance):** `validate spec` on a 300-line spec takes under 200 ms (median of 5 runs after 3 warm-ups, CI `ubuntu-latest` Node 22; limit ×4 when `process.platform === "win32"`), measured on the function and on the built CLI.
- **RNF-02 (supply chain):** zero runtime dependencies (ADR-0001); the package policy test still passes.
- **RNF-03 (compatibility / stable output):** the `--json` output has the fixed shape of RF-03, in the same order for the same input, and does not depend on the platform, the line endings (LF or CRLF) or the order of file reads. Verified by tests comparing two runs and LF versus CRLF input.
- **RNF-04 (security / bounded input):** inputs over 1 MiB are rejected before parsing; the patterns are linear (no nested quantifiers); the command reads only the file given and the schemas folder, and writes nothing. Verified by tests with an oversized input and a pathological line.
- **RNF-05 (usability / bounded messages):** every error has a rule name and a message that says what to fix; a run never prints more than 50 errors, and no message quotes more than 80 characters of the input (longer text is cut). Verified by a test with a 10,000-character line.
- Authorization / isolation, LGPD, cost: none. This is a local read-only command with no endpoint; inputs are not sent anywhere or stored.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** a built CLI and a valid file of each kind, **When** `validate <kind> <file>` and `validate <kind> -` (with the content on stdin) run, **Then** both exit 0 with an OK line. *Verification:* test `tests/validate/command.test.ts`
- **CA-02** (RF-02) — **Given** a valid file, an invalid file, an unknown kind, a missing argument, an unknown option and a missing file, **When** the command runs, **Then** the exit codes are 0, 1, 2, 2, 2 and 2, and the usage errors print the usage on stderr. *Verification:* test `tests/validate/command.test.ts`
- **CA-03** (RF-03) — **Given** invalid input, **When** `--json` is used, **Then** stdout is exactly one JSON object `{ valid, errors }` with each error as `{ path, rule, message }`; **And** without `--json` each error is one stderr line `<path>: <rule>: <message>`. *Verification:* test `tests/validate/command.test.ts`
- **CA-04** (RF-04, RNF-05) — **Given** a spec with 80 errors and a JSON envelope with 80 errors, **When** validated, **Then** exactly 50 errors are listed; **And** a spec error path is `file:line` with the right line, a stdin error path starts with `<stdin>:`, and a JSON error path is a JSON Pointer. *Verification:* test `tests/validate/command.test.ts`
- **CA-05** (RF-05) — **Given** a temp folder with its own copy of the schemas where `cortex.plan` differs, **When** `validate tasks --schemas <dir>` runs, **Then** the schemas of that folder are used; **And** without `--schemas` the package schemas are used even when the current directory has a `schemas/` folder. *Verification:* test `tests/validate/command.test.ts`
- **CA-06** (RF-06, RNF-04) — **Given** a file of 1 MiB plus 1 byte, **When** any kind is validated, **Then** the result is `too-large`, exit 1, and the file is not parsed. *Verification:* test `tests/validate/command.test.ts`
- **CA-07** (RF-07) — **Given** specs missing the Status header, each of the four sections, or with an empty section, **When** validated, **Then** each is reported with the rule and the line (or the end-of-file line when the section is missing). *Verification:* test `tests/validate/spec.test.ts` (fixtures in `tests/fixtures/validate/spec/`)
- **CA-08** (RF-08) — **Given** RF lines that start with `THE SYSTEM`, `WHEN`, `WHILE`, `IF`, `WHERE` and `THE CI` and contain `SHALL`, **When** validated, **Then** they pass; **And** a line that starts with `The system will`, a line without `SHALL`, and a line with `SHALL` but a non-EARS start are rejected. *Verification:* test `tests/validate/spec.test.ts`
- **CA-09** (RF-09) — **Given** duplicate ids, a gap (`RF-01`, `RF-03`), a family not starting at 01, and a spec using `FR-`, `NFR-` and `AC-`, **When** validated, **Then** the first three are rejected and the alias spec passes. *Verification:* test `tests/validate/spec.test.ts`
- **CA-10** (RF-10) — **Given** CAs with Given/When/Then, Dado/Quando/Então, only two of the three parts, the parts out of order, and a reference to `RF-99`, **When** validated, **Then** the first two pass and the other three are rejected. *Verification:* test `tests/validate/spec.test.ts`
- **CA-11** (RF-11) — **Given** a matrix missing an RF row, with a row without CA, and with a row for `RF-99` or `CA-99`, **When** validated, **Then** each is rejected; **And** a complete matrix passes. *Verification:* test `tests/validate/spec.test.ts`
- **CA-12** (RF-12) — **Given** every file matching `docs/sdd/[0-9]*.md` (specs 01a, 01b, 02a, 02b and 03 to 06), **When** `validate spec` runs on each, **Then** each exits 0. *Verification:* test `tests/validate/spec-regression.test.ts` (reads `docs/sdd/`)
- **CA-13** (RF-13) — **Given** plans with a duplicate step id, a `depends_on` to a missing step, a cycle (including a self-dependency), `mode: sequential` with `max_agents` 2, and `parent_id` equal to `id`, **When** `validate tasks` runs, **Then** each is rejected with its rule and JSON Pointer; **And** a valid parallel plan and a valid sequential plan with `max_agents` 1 pass. *Verification:* test `tests/validate/tasks.test.ts`
- **CA-14** (RF-13) — **Given** a plan that breaks the schema (for example `max_agents` 11), **When** `validate tasks` runs, **Then** the schema error is reported with its JSON Pointer and the cross-field rules still run on the readable parts. *Verification:* test `tests/validate/tasks.test.ts`
- **CA-15** (RF-14) — **Given** verdicts that are `rejected` with no finding, with only `minor` and `info` findings, with a duplicate finding id, and with `parent_id` equal to `id`, **When** `validate verdict` runs, **Then** each is rejected; **And** `rejected` with one `major` finding, `approved` with no findings and `escalate` pass. *Verification:* test `tests/validate/verdict.test.ts`
- **CA-16** (RF-15) — **Given** one valid and one invalid envelope for each of the nine kinds (including `blocked` with duplicate option ids, `task` with duplicate acceptance ids, and `parent_id` equal to `id` in each kind), **When** `validate envelope` runs, **Then** results match the expectation. *Verification:* test `tests/validate/envelope.test.ts` (fixtures in `tests/fixtures/validate/envelope/`)
- **CA-17** (RF-16) — **Given** a plan sent to `validate verdict`, an envelope with `schema` `cortex.foo/v1`, and malformed JSON, **When** validated, **Then** the rules are `wrong-kind`, `unknown-schema` and `json-parse`, in that order of cases. *Verification:* test `tests/validate/envelope.test.ts`
- **CA-18** (RF-17) — **Given** the headers `feat(cli): add x`, `fix: y`, `docs(sdd-06): z`, `feature: a`, `feat(CLI): b`, `feat(): c`, `feat:` and `feat(cli) d`, **When** validated, **Then** the first three pass and the last five are rejected. *Verification:* test `tests/validate/commit.test.ts`
- **CA-19** (RF-18) — **Given** a header of 100 characters, a header of 101, and a description ending in `.`, **When** validated, **Then** the first passes and the other two are rejected. *Verification:* test `tests/validate/commit.test.ts`
- **CA-20** (RF-19) — **Given** a message with a body right after the header, one with a blank line, one with `Refs: spec-06, JIRA-1`, one with an empty `Refs:`, **When** validated, **Then** the first and the last are rejected and the other two pass. *Verification:* test `tests/validate/commit.test.ts`
- **CA-21** (RF-20, RF-21) — **Given** `Merge branch 'develop' into x` (and a long second line) and a valid message written in Portuguese and in English, **When** validated, **Then** all pass. *Verification:* test `tests/validate/commit.test.ts`
- **CA-22** (RF-22) — **Given** `docs/ARCHITECTURE.md` and `docs/INSTRUCTIONS.md`, **When** reviewed, **Then** ARCHITECTURE points the rules to `src/validate/`, INSTRUCTIONS documents the command, kinds, options, exit codes and `--json`. *Verification:* manual (read the files against the RF)
- **CA-23** (RNF-01) — **Given** a generated 300-line valid spec, **When** validated (3 warm-ups, 5 timed runs), **Then** the median is under 200 ms (×4 on `win32`). *Verification:* test `tests/validate/perf.test.ts`
- **CA-24** (RNF-02) — **Given** `package.json`, **When** the policy test runs, **Then** there are no runtime `dependencies`. *Verification:* test `tests/package-policy.test.ts`
- **CA-25** (RNF-03) — **Given** the same invalid spec in LF and in CRLF, **When** validated twice with `--json`, **Then** all four outputs are byte-identical. *Verification:* test `tests/validate/command.test.ts`
- **CA-26** (RNF-04) — **Given** a 100,000-character line with repeated spaces and a spec with 10,000 requirement lines, **When** validated, **Then** the run ends in under 2 s and the command creates no file. *Verification:* test `tests/validate/perf.test.ts`
- **CA-27** (RNF-05) — **Given** a spec with a 10,000-character requirement line that breaks a rule and a JSON file with a 10,000-character string value that breaks a limit, **When** validated, **Then** no error message contains more than 80 characters of the input. *Verification:* test `tests/validate/command.test.ts`

## Design
**Files (closed list — this is the write authorization):**
- `src/validate/spec.ts` (structure, EARS, ids, Given/When/Then, matrix), `src/validate/commit.ts`, `src/validate/envelope-rules.ts` (cross-field rules per kind; shared by `tasks`, `verdict` and `envelope`)
- `src/commands/validate.ts` (arguments, input reading, schemas loading, output)
- `src/cli.ts` (dispatch of `validate`, options `--json` and `--schemas`; `USAGE` line; spec-03 adds its own branch)
- `tests/validate/{command,spec,spec-regression,tasks,verdict,envelope,commit,perf}.test.ts`
- `tests/fixtures/validate/{spec,envelope,commit}/` (valid and invalid files)
- Docs: `docs/ARCHITECTURE.md` ("Rules the schemas do not encode"), `docs/INSTRUCTIONS.md`
- No change to `schemas/`, `catalog/`, `package.json` or `check-self.ts`. JSON schema validation reuses `src/schemas/` (`loadRegistry`, `validate`).

**Spec format rules** (derived from specs 01a, 01b, 02a and 02b, which all follow them today; shared with spec-04):
- Header: a line `- **Status:** <value>` before the first `##` heading is required; the other header lines (level, risk, dependencies, branch) are recommended.
- Sections (level-2 headings, exact text): `Functional requirements`, `Non-functional requirements`, `Acceptance criteria`, `Traceability matrix`. Other sections are free.
- Requirement line: `- **RF-NN:**` or `- **RF-NN (label):**` followed by text; same for `RNF`. Bold lines that are not list items (sub-headings such as `**Shared definitions and header**`) are ignored. Continuation lines (indented or non-list) belong to the previous item.
- CA line: `- **CA-NN** (RF-NN, RNF-NN) — **Given** ... **When** ... **Then** ...`; the parenthesis lists the covered requirement ids (aliases accepted).
- Matrix: a Markdown table whose first column is the requirement id and second column the CA ids (comma-separated); header and separator rows are skipped.
- Ids are numeric with at least two digits, unique and sequential from 01 inside each family (`RF`/`FR`, `RNF`/`NFR`, `CA`/`AC`); an alias and its family count as one family.
- EARS check is lexical (first words `THE <subject>`, `WHEN`, `WHILE`, `IF` or `WHERE`, and the word `SHALL`), not a grammar; RNF lines need no EARS check.
- Error paths use the line of the item (or of the section heading).

**Rule names (stable, used in `rule`):** `schema` (JSON Schema errors, with the keyword in the message), `too-large`, `json-parse`, `wrong-kind`, `unknown-schema`, `rejected-without-blocker`, `duplicate-id`, `dangling-ref`, `dependency-cycle`, `sequential-max-agents`, `parent-equals-id`, `spec-header`, `spec-section`, `ears`, `id-sequence`, `given-when-then`, `matrix-coverage`, `matrix-ref`, `commit-header`, `commit-length`, `commit-blank-line`, `commit-refs`.

**Output.** Text mode: OK line `OK: <kind> valid (<name>)` on stdout, errors on stderr. JSON mode: one line of JSON plus newline on stdout, nothing on stderr (except usage errors).

**Decisions (cycle 1):** the schemas folder option is `--schemas <dir>` (not `--root`, which means the project root in spec-03); the regression test covers every `docs/sdd/[0-9]*.md`, including this spec; messages quote at most 80 input characters.

**Decisions made while writing (not specified by the owner; confirm at approval):**
- Input larger than 1 MiB is rejected (`too-large`), a limit chosen to keep the run bounded.
- An unreadable or missing file is a usage error (exit 2); malformed content is invalid input (exit 1).
- A CA must reference at least one existing requirement id, and the matrix must give each requirement at least one CA (stronger than "covers every id").
- `THE <SUBJECT> SHALL` is accepted as EARS because the real spec 01b uses `THE CI SHALL`.
- A `Refs:` line with an empty value is invalid; a missing `Refs:` is valid.
- The `rejected` rule counts only `blocker` and `major` (as in ARCHITECTURE).
- The `schema` rule keeps the schema errors from spec-02a as they are and adds the cross-field rules on top; if the structure is unreadable, cross-field rules skip the unreadable parts.

## Tasks
- [x] `src/validate/envelope-rules.ts` with tests (`tasks`, `verdict`, `envelope`)
- [x] `src/validate/spec.ts` with tests and the regression test over every `docs/sdd/[0-9]*.md`
- [x] `src/validate/commit.ts` with tests
- [x] `src/commands/validate.ts` and `src/cli.ts` dispatch; output, exit codes, limits
- [x] Performance and bounded-input tests
- [ ] Docs updated (`docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md`)

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm --silent lint                                  # exit 0
pnpm --silent typecheck                             # exit 0
pnpm --silent test                                  # all pass, including tests/validate
pnpm --silent build                                 # exit 0
node dist/cli.js check --self                       # exit 0
node dist/cli.js validate spec docs/sdd/02b-cortex-envelopes.md   # exit 0
pnpm --silent test:smoke                            # all pass, exit 0
```

## Changelog
- **Adicionado:** comando `agent-kit validate` para checar specs, planos (`tasks`), vereditos (`verdict`), envelopes `cortex.*` e mensagens de commit, com saída `--json` estável.
- **Atenção no deploy:** nenhuma

## Out of scope
- Checking the quality or measurability of the requirement text (the validator checks structure only).
- Checking the language of commits.
- Git hooks or CI wiring that call the validators.
- Changes to the envelope schemas (spec-02b).
- The installer (spec-03) and the content that uses the validators (spec-04).

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `src/commands/validate.ts`, `src/cli.ts`, `tests/validate/command.test.ts` ||
| RF-02 | CA-02 | test | `src/commands/validate.ts`, `tests/validate/command.test.ts` ||
| RF-03 | CA-03 | test | `src/commands/validate.ts`, `tests/validate/command.test.ts` ||
| RF-04 | CA-04 | test | `src/commands/validate.ts`, `tests/validate/command.test.ts` ||
| RF-05 | CA-05 | test | `src/commands/validate.ts`, `tests/validate/command.test.ts` ||
| RF-06 | CA-06 | test | `src/commands/validate.ts`, `tests/validate/command.test.ts` ||
| RF-07 | CA-07 | test | `src/validate/spec.ts`, `tests/validate/spec.test.ts` ||
| RF-08 | CA-08 | test | `src/validate/spec.ts`, `tests/validate/spec.test.ts` ||
| RF-09 | CA-09 | test | `src/validate/spec.ts`, `tests/validate/spec.test.ts` ||
| RF-10 | CA-10 | test | `src/validate/spec.ts`, `tests/validate/spec.test.ts` ||
| RF-11 | CA-11 | test | `src/validate/spec.ts`, `tests/validate/spec.test.ts` ||
| RF-12 | CA-12 | test | `src/validate/spec.ts`, `tests/validate/spec-regression.test.ts` ||
| RF-13 | CA-13, CA-14 | test | `src/validate/envelope-rules.ts`, `tests/validate/tasks.test.ts` ||
| RF-14 | CA-15 | test | `src/validate/envelope-rules.ts`, `tests/validate/verdict.test.ts` ||
| RF-15 | CA-16 | test | `src/validate/envelope-rules.ts`, `tests/validate/envelope.test.ts` ||
| RF-16 | CA-17 | test | `src/commands/validate.ts`, `tests/validate/envelope.test.ts` ||
| RF-17 | CA-18 | test | `src/validate/commit.ts`, `tests/validate/commit.test.ts` ||
| RF-18 | CA-19 | test | `src/validate/commit.ts`, `tests/validate/commit.test.ts` ||
| RF-19 | CA-20 | test | `src/validate/commit.ts`, `tests/validate/commit.test.ts` ||
| RF-20 | CA-21 | test | `src/validate/commit.ts`, `tests/validate/commit.test.ts` ||
| RF-21 | CA-21 | test | `src/validate/commit.ts`, `tests/validate/commit.test.ts` ||
| RF-22 | CA-22 | manual | `docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md` ||
| RNF-01 | CA-23 | test | `src/validate/spec.ts`, `tests/validate/perf.test.ts` ||
| RNF-02 | CA-24 | test | `package.json`, `tests/package-policy.test.ts` ||
| RNF-03 | CA-25 | test | `src/commands/validate.ts`, `tests/validate/command.test.ts` ||
| RNF-04 | CA-06, CA-26 | test | `src/commands/validate.ts`, `tests/validate/perf.test.ts` ||
| RNF-05 | CA-04, CA-27 | test | `src/commands/validate.ts`, `tests/validate/command.test.ts` ||

## Execution notes
- `Io` in `src/cli.ts` gained an optional `stdin` seam so tests feed standard input in-process; the default reads fd 0.
- Docs (RF-22, CA-22) left for the doc-writer, as requested by the coordinator.
- Regression CA-12 also run locally against specs 03, 04 and 05 from the main checkout: all exit 0.
- Gate: lint, typecheck, test (283), build, check --self and test:smoke pass.

## Validation report
<!-- Filled by the validators (spec review and delivery validation). -->
