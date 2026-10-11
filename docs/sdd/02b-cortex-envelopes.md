# Spec 02b — cortex.*/v1 envelopes

- **Status:** em andamento
- **Nível:** completo
- **Risco:** médio
- **Depende de:** spec-02a
- **Épico:** agent-kit v1
- **Branch:** feature/spec-02b-cortex-envelopes
- **Jira:** —
- **PR:** —
- **Versão:** —
- **ADR:** ADR-0002
- **Contexto:** `docs/sdd/02a-contracts-core.md`, `docs/adr/0002-own-json-schema-subset-validator.md`, `docs/ARCHITECTURE.md`, `.claude/workflow.md`

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)

## Context
Agents in agent-kit exchange work through small structured messages called envelopes. This spec defines the nine `cortex.<kind>/v1` envelopes as JSON Schemas, using the validator, registry and conformance harness (RF-25) from spec-02a. The envelopes are domain-neutral: the work item can be a spec, a brief or a campaign, so the same contracts serve software and non-software packs.

Delivery validation escalates to spec-validator (level "completo"; the contract is public and versioned).

The schemas stay inside the keyword subset of spec-02a (no `allOf`, `if`, `contains`). Some rules are therefore not expressible; they are listed in RF-14 and enforced by code in spec-06.

## Functional requirements
**Shared definitions and header**
- **RF-01:** THE SYSTEM SHALL provide `schemas/cortex/defs.schema.json` (`$id` `urn:agent-kit:cortex:defs:v1`) with the reusable definitions listed in Design, "Definitions".
- **RF-02:** THE SYSTEM SHALL provide one schema per envelope kind at `schemas/cortex/<kind>.schema.json` with `$id` `urn:agent-kit:cortex:<kind>:v1`, for the kinds `task`, `result`, `blocked`, `verdict`, `plan`, `handoff`, `lesson`, `design` and `observation`.
- **RF-03:** THE SYSTEM SHALL require, at the root of every envelope and with `additionalProperties: false`: `schema` (const `cortex.<kind>/v1`), `id` (`uuid`), `created_at` (`timestamp`: RFC 3339 UTC; `T` and `Z` must be uppercase, which is stricter than the `date-time` format of spec-02a), `producer` (`agent`: a `name`; `run`: `ref-id`, optional), `work_item` (`item-id`: the id of the work item, such as a spec, brief or campaign), `body` (object specific to the kind); and allow the optional `parent_id` (`uuid`: the envelope this one answers) and `correlation_id` (`ref-id`).
- **RF-04:** THE SYSTEM SHALL NOT use `allOf`, `if`, `then`, `else`, `not` or `contains` in any envelope schema, and SHALL repeat the header properties in each envelope through `$ref` to the definitions.

**Bodies.** Every field, type, requirement, limit and uniqueness is fixed in Design, "Field tables"; the requirements below summarize them.
- **RF-05 (task):** THE SYSTEM SHALL require `title`, `instructions`, `assignee`, `acceptance` (1–10 items), `scope` (`allow` 1–6 globs, `deny` 0–6 globs) and `inputs` (0–8 items, `kind` one of `file`, `url`, `envelope`, `note`); and allow an optional `budget` (`max_tokens`, `max_minutes`, both required inside it).
- **RF-06 (result):** THE SYSTEM SHALL require `status` (`done` or `partial`), `summary`, `changes` (0–20 items, `action` one of `add`, `modify`, `delete`) and `evidence` (0–20 items, `kind` one of `test`, `command`, `manual`, `inspection`, `outcome` one of `pass`, `fail`, `pending`); and allow an optional `usage` and an optional `notes`.
- **RF-07 (blocked):** THE SYSTEM SHALL require `reason` (one of `question`, `conflict`, `missing-access`, `out-of-scope`, `budget`, `failure`), `question` and `options` (0–4 items); and allow an optional `context`.
- **RF-08 (verdict):** THE SYSTEM SHALL require `decision` (one of `approved`, `rejected`, `escalate`), `findings` (0–12 items, `severity` one of `blocker`, `major`, `minor`, `info`) and `checked` (0–20 unique criterion ids).
- **RF-09 (plan):** THE SYSTEM SHALL require `mode` (`sequential` or `parallel`), `max_agents` (integer 1–10) and `steps` (1–12 items); and allow an optional `estimate` inside each step.
- **RF-10 (handoff):** THE SYSTEM SHALL require `reason` (one of `quota`, `timeout`, `manual`, `failure`), `summary`, `done`, `next` and `open_questions`; and allow an optional `refs`.
- **RF-11 (lesson):** THE SYSTEM SHALL require `title`, `lesson`, `tags`, `applies_to` and `confidence` (one of `low`, `medium`, `high`); and allow an optional `context`.
- **RF-12 (design):** THE SYSTEM SHALL require `lane`, `status` (one of `proposed`, `promoted`, `rejected`) and `artifacts` (1–10 items); and allow an optional `rationale`.
- **RF-13 (observation):** THE SYSTEM SHALL require `kind` (one of `stall`, `loop`, `budget`, `error`, `summary`, `info`), `severity` (one of `info`, `warning`, `critical`), `subject` and `message`; and allow an optional `metrics` (object of numbers, at most 32 keys, keys matching `^[a-z][a-z0-9_]{0,63}$`).
- **RF-14:** THE SYSTEM SHALL document in `docs/ARCHITECTURE.md`, as rules that the schemas do not encode and that `agent-kit validate` (spec-06) enforces: (a) a `rejected` verdict needs at least one `blocker` or `major` finding; (b) `plan.steps[].depends_on` points to existing step ids, with no cycles, and the ids of steps, `blocked.options`, `verdict.findings` and `task.acceptance` are unique within their list; (c) `mode: sequential` implies `max_agents` 1; (d) `parent_id` differs from `id`. THE SCHEMAS SHALL NOT attempt to encode them.
- **RF-15:** THE SYSTEM SHALL document the nine envelopes in `docs/ARCHITECTURE.md` in a table with purpose and typical emitter, and list all nine in the `README.md` Schemas row.

## Non-functional requirements
- **RNF-01 (security / bounded input):** every node has `type`, `const`, `enum` or `$ref`; every string has `maxLength`; every array has `maxItems`; every object has `additionalProperties: false`, except `metrics`, which has `patternProperties`, `additionalProperties: false` and `maxProperties`. Verified by a structural test over all envelope schemas.
- **RNF-02 (reliability / size):** by design of the limits, any valid envelope serialized as compact JSON (`JSON.stringify` without spaces) is at most 64 KiB (65,536 bytes). The Design fixes the limits and records the worst case per kind; a test recomputes it with the model in Design, "Size model".
- **RNF-03 (compatibility / SemVer):** a published schema is compatible when every instance that is valid under the published version stays valid under the new one. Relaxing a limit or adding an `enum` value is compatible. Tightening a limit, removing an `enum` value, or adding a field requires a new major in a new file (`...:v2`, for example `schemas/cortex/task.v2.schema.json`); adding a field needs v2 because `additionalProperties: false` makes older readers reject envelopes that carry it. A `v1` schema is never edited incompatibly after the first release. The rule is recorded in `docs/ARCHITECTURE.md`; an automatic guard (valid fixtures of a published version are append-only and must stay valid) is left to spec-07.
- **RNF-04 (neutrality):** no required field name is software-specific; the only software-flavored names are inside the optional `handoff.refs`. Verified by a denylist test over required property names at every depth, with a self-test.
- **RNF-05 (reliability / conformance):** the own validator and `ajv` agree with the folder expectation on 100% of the fixtures of every envelope (spec-02a harness), with at least 1 valid and 3 invalid fixtures per kind, one invalid fixture per category (missing required field, invalid enum value, extra property), each declared in `cases.json`.
- **RNF-06 (performance):** validating the largest valid fixture of each kind takes under 20 ms (3 warm-up runs, median of 5, CI `ubuntu-latest` Node 22; limit ×4 when `process.platform === "win32"`).
- Authorization / isolation, LGPD, cost: none. The schemas are static files with no endpoint or stored data; the length limits bound what a message can hold, and envelopes should not carry personal data.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** `schemas/cortex/defs.schema.json`, **When** the registry loads, **Then** it is registered as `urn:agent-kit:cortex:defs:v1` and each definition runs through the harness with its fixtures (boundary lengths included). *Verification:* test `tests/schemas-conformance.test.ts` (fixtures in `tests/fixtures/schemas/cortex-defs/<def>/`)
- **CA-02** (RF-02) — **Given** the `schemas/cortex/` folder, **When** the registry loads, **Then** it has `defs` plus exactly the nine kinds, each with `$id` `urn:agent-kit:cortex:<kind>:v1`. *Verification:* test `tests/cortex-envelopes.test.ts`
- **CA-03** (RF-03) — **Given** each envelope schema, **When** the test inspects it, **Then** the root requires `schema`, `id`, `created_at`, `producer`, `work_item` and `body`, lists the optional `parent_id` and `correlation_id`, and sets `additionalProperties: false`; **And** `schema` is a const equal to `cortex.<kind>/v1` and matches the file name. *Verification:* test `tests/cortex-envelopes.test.ts`
- **CA-04** (RF-03) — **Given** header fixtures, **When** validated, **Then** a missing `id`, a non-UUID `id`, a `created_at` with an offset instead of `Z`, a `created_at` with a lowercase `t` or `z` (`2026-01-02t03:04:05Z`), a `created_at` of `2026-02-30T00:00:00Z`, a `work_item` of 0 or 129 characters, a `producer.run` of 0 characters, and an extra root property are each rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-task/invalid/`)
- **CA-05** (RF-04) — **Given** the parsed envelope schemas, **When** the test walks the keyword positions of every schema node (not the text), **Then** no node has `allOf`, `if`, `then`, `else`, `not` or `contains` as a keyword, and every `$ref` value points to `urn:agent-kit:cortex:defs:v1` or `urn:agent-kit:common:v1`; **And** a self-test with a planted `allOf` node is caught while a property named `not` is not. *Verification:* test `tests/cortex-envelopes.test.ts`
- **CA-06** (RF-05) — **Given** task fixtures, **When** validated, **Then** a complete task passes (with and without `budget`); a task without `acceptance`, with an `acceptance.id` such as `a-1`, with an empty `scope.allow`, with an `inputs.kind` of `ftp`, with duplicate `scope.allow` entries, or with an extra property is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-task/`)
- **CA-07** (RF-06) — **Given** result fixtures, **When** validated, **Then** a complete result passes (with and without `usage`); a result with `status` `finished`, with an `evidence.outcome` of `ok`, with a `changes.action` of `rename`, without `summary`, or with a negative `usage.cost_usd` is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-result/`)
- **CA-08** (RF-07) — **Given** blocked fixtures, **When** validated, **Then** a blocked envelope with 0 and with 4 options passes; one with 5 options, an unknown `reason`, a missing `question`, or an extra property is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-blocked/`)
- **CA-09** (RF-08, RF-14) — **Given** verdict fixtures, **When** validated, **Then** an approved verdict with no findings passes, **and a `rejected` verdict with zero findings also passes** (fixture that pins the "SHALL NOT encode" rule of RF-14); an unknown `decision`, an unknown `severity`, a missing `findings`, or duplicate `checked` entries is rejected; **And** `docs/ARCHITECTURE.md` lists the rules of RF-14 as enforced by spec-06. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-verdict/`) and manual (read the Architecture note)
- **CA-10** (RF-09) — **Given** plan fixtures, **When** validated, **Then** a plan with `max_agents` 1 and 10 and one step passes; `max_agents` 0 or 11, `mode` `serial`, zero steps, or duplicate `depends_on` entries is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-plan/`)
- **CA-11** (RF-10) — **Given** handoff fixtures, **When** validated, **Then** a handoff with and without `refs` passes; a `commit` of `XYZ`, a `commit` of 6 or 65 hexadecimal characters, a `reason` of `tired`, or a missing `next` is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-handoff/`)
- **CA-12** (RF-11) — **Given** lesson fixtures, **When** validated, **Then** a complete lesson passes; a `confidence` of `certain`, a `tags` item that is not a `name`, duplicate `tags`, or a missing `lesson` is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-lesson/`)
- **CA-13** (RF-12) — **Given** design fixtures, **When** validated, **Then** a design with one artifact passes; empty `artifacts`, a `status` of `draft`, or an extra property is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-design/`)
- **CA-14** (RF-13) — **Given** observation fixtures, **When** validated, **Then** an observation with and without `metrics` passes (32 keys pass); `metrics` with a key `Bad-Key`, a string value or 33 keys, a `severity` of `fatal`, or a `subject.kind` of `team` is rejected. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/cortex-observation/`)
- **CA-15** (RF-15) — **Given** `docs/ARCHITECTURE.md` and `README.md`, **When** reviewed, **Then** the table lists the nine envelopes with purpose and typical emitter, and the README Schemas row lists all nine. *Verification:* manual (read the files against the RF)
- **CA-16** (RNF-01) — **Given** all envelope schemas, **When** the structural test walks every node, **Then** every node has `type`, `const`, `enum` or `$ref`; every `type: string` has `maxLength` (a `const` or `enum` string is exempt); every `type: array` has `maxItems`; every `type: object` has `additionalProperties: false`; every `type: number` or `integer` has `minimum` and `maximum`; and the `metrics` object has `maxProperties`. *Verification:* test `tests/cortex-envelopes.test.ts`
- **CA-17** (RNF-02) — **Given** each envelope schema, **When** the test computes the worst-case size with the Size model in Design (returning `Infinity` for any node without a finite bound), **Then** every kind is at most 65,536 bytes and no larger than the value in the worst-case table; **And** the largest valid fixture of each kind is under 64 KiB when serialized. *Verification:* test `tests/cortex-envelopes.test.ts`
- **CA-18** (RNF-03) — **Given** `docs/ARCHITECTURE.md`, **When** reviewed, **Then** it states the compatibility rule of RNF-03 (valid instances stay valid; what is compatible and what needs v2; the effect on older readers; `v1` never edited incompatibly after release). *Verification:* manual (read the Architecture note)
- **CA-19** (RNF-04) — **Given** the required property names at every depth of all envelope schemas, **When** the test splits each name on `_` and `-` and compares the tokens with the denylist (`branch`, `commit`, `repo`, `pr`, `diff`, `test`, `spec`, `patch`, `worktree`), **Then** none appears outside `handoff.refs` (a name such as `producer` is not a false positive); **And** a self-test with a planted required `commit_id` is caught. *Verification:* test `tests/cortex-envelopes.test.ts`
- **CA-20** (RNF-05) — **Given** all envelope fixtures, **When** the own validator and `ajv` 2020 validate them, **Then** results equal the folder expectation, each kind has at least 1 valid and 3 invalid fixtures, and each invalid fixture is declared in `cases.json` with its keyword and `instancePath`. *Verification:* test `tests/schemas-conformance.test.ts`
- **CA-21** (RNF-06) — **Given** the largest valid fixture of each kind, **When** validated (3 warm-up runs, 5 timed runs), **Then** the median is under 20 ms (×4 on `win32`). *Verification:* test `tests/cortex-envelopes.test.ts`

## Design
**Files (closed list — this is the write authorization):**
- `schemas/cortex/defs.schema.json`
- `schemas/cortex/{task,result,blocked,verdict,plan,handoff,lesson,design,observation}.schema.json`
- `tests/cortex-envelopes.test.ts`
- `tests/fixtures/schemas/cortex-defs/<def>/{valid,invalid}/*.json` + `cases.json`
- `tests/fixtures/schemas/cortex-<kind>/{valid,invalid}/*.json` + `cases.json` for the nine kinds (at least 1 valid and 3 invalid each; one invalid per category: missing required field, invalid enum value, extra property)
- Docs: `docs/ARCHITECTURE.md` (envelope table, SemVer and compatibility rule, rules not encoded, size bound), `README.md` (Schemas row)
- No change to `src/` or `package.json`: conformance is covered by `tests/schemas-conformance.test.ts` from spec-02a. The limits below are final; if an implementation cannot meet RNF-02 with them, it returns `BLOQUEADO` instead of changing a limit.

**Definitions** (`defs`; `name` and `glob` come from `urn:agent-kit:common:v1`: `name` 1–64, `glob` 1–256):

| Definition | Constraint |
|---|---|
| `uuid` | string, `format: uuid`, `maxLength` 36 |
| `timestamp` | string, `format: date-time`, pattern `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$`, `maxLength` 30 |
| `item-id` | string, 1–128 |
| `ref-id` | string, 1–128 |
| `token` | string, 1–32 (ids of steps, options and findings) |
| `criterion-id` | `^[A-Z]{2,4}-[0-9]{2,3}$`, `maxLength` 8 |
| `title` | string, 1–120 |
| `short-text` | string, 1–160 |
| `note` | string, 1–400 |
| `text` | string, 1–600 |
| `long-text` | string, 1–2000 |
| `ref` | string, 1–160 (paths, URLs, ids, branch names) |
| `commit-hash` | `^[0-9a-f]{7,64}$`, `maxLength` 64 (covers SHA-1 and SHA-256) |
| `positive-int` | integer, `minimum` 1, `maximum` 10000000 |
| `count` | integer, `minimum` 0, `maximum` 10000000 |
| `money` | number, `minimum` 0, `maximum` 1000000 |
| `metric` | number, `minimum` −1000000000000, `maximum` 1000000000000 |

**Field tables.** "Req" = required. "Max" = `maxItems` (arrays). "Uniq" = `uniqueItems: true`. Uniqueness of ids inside lists of objects is not expressible (RF-14).

Header (all kinds): `schema` const, req; `id` `uuid`, req; `created_at` `timestamp`, req; `producer` object, req (`agent` `name` req; `run` `ref-id` optional); `work_item` `item-id`, req; `parent_id` `uuid`, optional; `correlation_id` `ref-id`, optional; `body` object, req.

| Kind | Field | Definition | Req | Max | Uniq |
|---|---|---|---|---|---|
| task | `title` | `title` | yes | | |
| task | `instructions` | `long-text` | yes | | |
| task | `assignee` | `name` | yes | | |
| task | `acceptance` (min 1) | object `{id: criterion-id req, text: short-text req}` | yes | 10 | |
| task | `scope.allow` (min 1) | `glob` | yes | 6 | yes |
| task | `scope.deny` | `glob` | yes | 6 | yes |
| task | `inputs` | object `{kind: enum file/url/envelope/note req, ref: ref req}` | yes | 8 | |
| task | `budget.max_tokens`, `budget.max_minutes` | `positive-int` | req inside `budget` | | |
| task | `budget` | object | no | | |
| result | `status` | enum done/partial | yes | | |
| result | `summary` | `text` | yes | | |
| result | `changes` | object `{path: ref req, action: enum add/modify/delete req}` | yes | 20 | |
| result | `evidence` | object `{criterion: criterion-id, kind: enum test/command/manual/inspection, ref: ref, outcome: enum pass/fail/pending}`, all req | yes | 20 | |
| result | `usage` | object `{input_tokens, output_tokens, duration_ms: count req; cost_usd: money optional}` | no | | |
| result | `notes` | `text` | no | | |
| blocked | `reason` | enum question/conflict/missing-access/out-of-scope/budget/failure | yes | | |
| blocked | `question` | `text` | yes | | |
| blocked | `options` | object `{id: token, label: title, recommended: boolean}`, all req | yes | 4 | |
| blocked | `context` | `text` | no | | |
| verdict | `decision` | enum approved/rejected/escalate | yes | | |
| verdict | `findings` | object `{id: token req, severity: enum blocker/major/minor/info req, criterion: criterion-id opt, location: ref opt, message: note req}` | yes | 12 | |
| verdict | `checked` | `criterion-id` | yes | 20 | yes |
| plan | `mode` | enum sequential/parallel | yes | | |
| plan | `max_agents` | integer 1–10 | yes | | |
| plan | `steps` (min 1) | object `{id: token req, title: title req, assignee: name req, depends_on req, acceptance req, estimate opt}` | yes | 12 | |
| plan | `steps[].depends_on` | `token` | yes | 6 | yes |
| plan | `steps[].acceptance` | `criterion-id` | yes | 8 | yes |
| plan | `steps[].estimate` | object `{human_minutes, ai_minutes: count}`, both req inside | no | | |
| handoff | `reason` | enum quota/timeout/manual/failure | yes | | |
| handoff | `summary` | `text` | yes | | |
| handoff | `done` | `title` | yes | 12 | |
| handoff | `next` | `title` | yes | 12 | |
| handoff | `open_questions` | `title` | yes | 8 | |
| handoff | `refs` | object `{branch: ref, commit: commit-hash, worktree: ref, patch: ref}`, all optional | no | | |
| lesson | `title` | `short-text` | yes | | |
| lesson | `lesson` | `long-text` | yes | | |
| lesson | `context` | `text` | no | | |
| lesson | `tags` | `name` | yes | 10 | yes |
| lesson | `applies_to` | `glob` | yes | 8 | yes |
| lesson | `confidence` | enum low/medium/high | yes | | |
| design | `lane` | `name` | yes | | |
| design | `status` | enum proposed/promoted/rejected | yes | | |
| design | `artifacts` (min 1) | object `{name: short-text, ref: ref}`, both req | yes | 10 | |
| design | `rationale` | `text` | no | | |
| observation | `kind` | enum stall/loop/budget/error/summary/info | yes | | |
| observation | `severity` | enum info/warning/critical | yes | | |
| observation | `subject` | object `{kind: enum run/agent/task req, ref: ref req}` | yes | | |
| observation | `message` | `text` | yes | | |
| observation | `metrics` | object, keys `^[a-z][a-z0-9_]{0,63}$`, values `metric`, `maxProperties` 32 | no | | |

**Size model.** Serialization is compact `JSON.stringify` output. Costs in bytes: string value = 6 × `maxLength` + 2 (UTF-8 allows 4 bytes per code point, and a control character escaped as `\u00XX` takes 6, so 6 is the safe bound); `const` or `enum` string = longest value length + 2; number = 24; boolean = 5; object = 2 + the sum over **all declared properties** (required and optional) of (key length + 3 for quotes and colon + value cost + 1 for the comma); array = 2 + `maxItems` × (element cost + 1); `$ref` is followed; `oneOf`/`anyOf` take the largest branch. For `patternProperties` the calculator knows one case: the key bound of `body.metrics` is 64 characters (taken from the pattern `{0,63}`); any other `patternProperties` object, and any node without a finite bound, returns `Infinity` and fails the test.

**Worst case per kind** (bytes of the whole envelope, header included; the test asserts at most 65,536 and no more than these values):

| Kind | Worst case (bytes) | Headroom to 65,536 |
|---|---|---|
| task | 53,420 | 12,116 |
| result | 52,205 | 13,331 |
| verdict | 48,606 | 16,930 |
| plan | 39,935 | 25,601 |
| lesson | 36,274 | 29,262 |
| handoff | 33,580 | 31,956 |
| design | 26,912 | 38,624 |
| blocked | 14,531 | 51,005 |
| observation | 11,059 | 54,477 |

**Decisions:**
- The envelopes use only the spec-02a subset; there is no `allOf`, so the header is repeated in each file through `$ref`. This keeps the oracle comparison simple and each file readable on its own.
- Identification: the const `schema` equals the file name, so `cortex.task/v1` lives in `task.schema.json` with `$id` `urn:agent-kit:cortex:task:v1`.
- Rules that need `contains`, `if` or cross-field checks stay out of the schemas (RF-14) and move to spec-06.
- Envelopes are domain-neutral: the software-flavored `handoff.refs` is optional.
- Limits favor long text for `instructions` and `lesson`, short items in lists, and fewer list items over cutting fields.

## Tasks
- [x] `schemas/cortex/defs.schema.json` with fixtures per definition
- [x] The nine envelope schemas
- [x] Fixtures: at least 1 valid and 3 invalid per kind, with `cases.json`
- [x] `tests/cortex-envelopes.test.ts` (structure, size model, neutrality, performance)
- [ ] Docs updated (`docs/ARCHITECTURE.md`, `README.md`)

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm --silent lint                                  # exit 0
pnpm --silent typecheck                             # exit 0
pnpm --silent test                                  # all pass, including conformance and cortex-envelopes
pnpm --silent build                                 # exit 0
node dist/cli.js check --self                       # exit 0, all schemas load
pnpm --silent test:smoke                            # all pass, exit 0
```

## Changelog
- **Adicionado:** schemas JSON dos nove envelopes `cortex.*/v1` (task, result, blocked, verdict, plan, handoff, lesson, design e observation).
- **Atenção no deploy:** nenhuma

## Out of scope
- Persistence and transport of envelopes.
- `agent-kit validate verdict` and the other rules in RF-14 (spec-06).
- The automatic compatibility guard for published versions (spec-07).
- Any change to the validator (spec-02a).
- Domain packs beyond the neutral bodies defined here.

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `schemas/cortex/defs.schema.json`, `tests/schemas-conformance.test.ts`, `tests/fixtures/schemas/cortex-defs/` | |
| RF-02 | CA-02 | test | `schemas/cortex/*.schema.json`, `tests/cortex-envelopes.test.ts` | |
| RF-03 | CA-03, CA-04 | test | `schemas/cortex/*.schema.json`, `tests/cortex-envelopes.test.ts`, `tests/schemas-conformance.test.ts` | |
| RF-04 | CA-05 | test | `schemas/cortex/*.schema.json`, `tests/cortex-envelopes.test.ts` | |
| RF-05 | CA-06 | test | `schemas/cortex/task.schema.json`, `tests/fixtures/schemas/cortex-task/` | |
| RF-06 | CA-07 | test | `schemas/cortex/result.schema.json`, `tests/fixtures/schemas/cortex-result/` | |
| RF-07 | CA-08 | test | `schemas/cortex/blocked.schema.json`, `tests/fixtures/schemas/cortex-blocked/` | |
| RF-08 | CA-09 | test | `schemas/cortex/verdict.schema.json`, `tests/fixtures/schemas/cortex-verdict/` | |
| RF-09 | CA-10 | test | `schemas/cortex/plan.schema.json`, `tests/fixtures/schemas/cortex-plan/` | |
| RF-10 | CA-11 | test | `schemas/cortex/handoff.schema.json`, `tests/fixtures/schemas/cortex-handoff/` | |
| RF-11 | CA-12 | test | `schemas/cortex/lesson.schema.json`, `tests/fixtures/schemas/cortex-lesson/` | |
| RF-12 | CA-13 | test | `schemas/cortex/design.schema.json`, `tests/fixtures/schemas/cortex-design/` | |
| RF-13 | CA-14 | test | `schemas/cortex/observation.schema.json`, `tests/fixtures/schemas/cortex-observation/` | |
| RF-14 | CA-09 | test + manual | `docs/ARCHITECTURE.md`, `schemas/cortex/verdict.schema.json`, `tests/fixtures/schemas/cortex-verdict/` | |
| RF-15 | CA-15 | manual | `docs/ARCHITECTURE.md`, `README.md` | |
| RNF-01 | CA-16 | test | `schemas/cortex/*.schema.json`, `tests/cortex-envelopes.test.ts` | |
| RNF-02 | CA-17 | test | `schemas/cortex/*.schema.json`, `tests/cortex-envelopes.test.ts` | |
| RNF-03 | CA-18 | manual | `docs/ARCHITECTURE.md` | |
| RNF-04 | CA-19 | test | `schemas/cortex/*.schema.json`, `tests/cortex-envelopes.test.ts` | |
| RNF-05 | CA-20 | test | `tests/schemas-conformance.test.ts`, `tests/fixtures/schemas/cortex-*/` | |
| RNF-06 | CA-21 | test | `schemas/cortex/*.schema.json`, `tests/cortex-envelopes.test.ts` | |

## Execution notes
Size model results match the Design table exactly (task 53,420; result 52,205; verdict 48,606; plan 39,935; lesson 36,274; handoff 33,580; design 26,912; blocked 14,531; observation 11,059). No limit changed. Docs task (ARCHITECTURE, README) left to doc-writer.

## Validation report
<!-- Filled by the validators (spec review and delivery validation). -->
