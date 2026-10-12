# Architecture — agent-kit

Target architecture. Each part is implemented through an approved spec (see `docs/sdd/README.md`).

## Overview

```mermaid
flowchart LR
  SRC["catalog/: skills, agents, workflows, rules"] --> CLI["agent-kit CLI (TypeScript)"]
  SCH["schemas/: cortex.*/v1"] --> CLI
  CLI --> INIT["init / update"]
  CLI --> CHECK["check / sync"]
  CLI --> VAL["validate spec | tasks | commit | verdict"]
  INIT --> T1["Claude Code: CLAUDE.md, .claude/"]
  INIT --> T2["Codex: AGENTS.md, .agents/skills"]
  INIT --> T3["Antigravity: AGENTS.md, .agents/"]
  INIT --> LOCK["agent-kit.lock.json"]
```

## Layout (planned)

```text
agent-kit/
├── .github/          # workflows/ci.yml (CI) and dependabot.yml
├── catalog/
│   ├── agents/       # one Markdown file per role, with frontmatter
│   ├── skills/       # <name>/SKILL.md, references/, scripts/
│   ├── workflows/    # slash-command procedures
│   └── rules/        # always-on rules
├── schemas/          # JSON Schema 2020-12: common.schema.json, frontmatter/*.schema.json, cortex/*.schema.json (cortex.*/v1 envelopes)
├── src/              # CLI (TypeScript, ESM, zero runtime dependencies)
│   ├── cli.ts        # exports main(argv, io) returning the exit code; argument parsing, dispatch
│   ├── version.ts    # reads the package version at runtime
│   ├── schemas/      # contracts core
│   │   ├── validate.ts     # validator for the supported JSON Schema subset
│   │   ├── formats.ts      # date-time and uuid checks
│   │   ├── registry.ts     # loadRegistry(dir), validate(id, value), $id and path rules
│   │   └── frontmatter.ts  # frontmatter extraction and restricted YAML parser
│   └── commands/     # one module per command (check-self today; install, sync, validate later)
├── tests/            # Vitest unit tests; tests/smoke runs the built dist/
└── docs/
```

## Install model

- The shared brain is `AGENTS.md` plus `.agents/` in the target project.
- Codex and Antigravity read `AGENTS.md` and `.agents/skills/` natively; Antigravity also reads `.agents/rules/` and `.agents/workflows/`.
- Claude Code gets `CLAUDE.md` importing `@AGENTS.md`, plus generated `.claude/skills/`, `.claude/agents/` and `.claude/commands/` (links where the OS allows, copies otherwise).
- Project-specific additions go to `.agents/local/` and are never overwritten by `update`.
- `agent-kit.lock.json` records the kit version, the target CLIs and a hash per installed file, so `check` can detect manual edits and drift.

## SDD content (catalog)

The kit ships its method as original content under `catalog/`: 13 workflows (`triage`, `spec`, `critique`, `design`, `tasks`, `build`, `verify`, `ship`, `sync`, `progress`, `debug`, `learn`, `ui-lanes`), 10 skills and 6 always-on rules. The text is in English, vendor-neutral and names no model. Skills keep long material in `references/`. `tests/catalog-brain.test.ts` checks the set, the cross-references and the absence of vendor names; `check --self` validates the frontmatter.

## Contracts

- Agent, skill, workflow and rule files use a versioned frontmatter format.
- Names are checked against each CLI's built-in commands to prevent collisions.

### Schema validator

The runtime has no dependencies (ADR-0001), so `src/schemas/validate.ts` implements a declared subset of JSON Schema 2020-12 (ADR-0002). `ajv` is a development-time oracle in tests only.

- **Supported keywords:** `$schema`, `$id`, `$ref`, `$defs`, `title`, `description`, `examples`, `default` (annotation only, never fills the instance), `type`, `const`, `enum`, `properties`, `patternProperties`, `additionalProperties`, `required`, `maxProperties`, `items`, `minItems`, `maxItems`, `uniqueItems`, `minLength`, `maxLength`, `pattern`, `format`, `minimum`, `maximum`, `oneOf`, `anyOf`. `$schema`, `$id` and `$defs` are allowed only at the root of a file.
- **Fail closed:** an unsupported keyword, a malformed keyword value, an unsupported `format`, a remote, unresolved or cyclic `$ref`, a nested `$id`/`$schema`/`$defs`, or a `pattern` without `maxLength` is a load error naming the file and the JSON Pointer. Nothing is silently ignored. `$ref` is local (`#/$defs/<name>`) or by `$id`, with an optional `#/$defs/<name>` fragment.
- **Safety:** lookups use own properties only, so `__proto__` or `constructor` are ordinary data. A `pattern` is not evaluated when `maxLength` already failed (ReDoS guard). Results hold at most 50 errors, and quoted values and property names are cut to 80 characters.
- **`format` is an assertion**, unlike the 2020-12 default (annotation). Only `date-time` (RFC 3339, with calendar and leap-second checks) and `uuid` (8-4-4-4-12 hex, any case) exist; non-string values pass.

### Schema identity and versions

`loadRegistry(dir)` loads every `*.schema.json` under `schemas/`. The `$id` must match the path: `frontmatter/agent.schema.json` is `urn:agent-kit:frontmatter:agent:v1`, and `<base>.v<N>.schema.json` (N >= 2) is `...:v<N>`. A file named `.v1` or `.v0` is invalid. `$schema` must be the 2020-12 URI. `agent-kit check --self` loads the schemas of the repository under check (`<root>/schemas`), never those of the installed package.

### Frontmatter

Files start with a `---` block (optional BOM) parsed by `src/schemas/frontmatter.ts`, a restricted YAML subset. Every accepted document means the same as in YAML 1.2; anything else is an error with a line number.

- Top-level `key: value` pairs only; no nested maps, anchors, aliases, tags, duplicate keys or tabs in indentation. The keys `__proto__`, `constructor` and `prototype` are rejected.
- Values: plain, single-quoted and double-quoted strings; lowercase `true`/`false`; safe integers; inline lists (`[a, b]`); block lists (`- item`); block scalars `|`, `|-`, `>`, `>-`.
- `null`, `~`, dates, floats and `True` stay strings. Ambiguous numbers (`+1`, `007`, `0x1F`, beyond 2^53-1) are errors: quote them.
- The block is limited to 16 KiB, checked before parsing. CRLF and LF give the same result. Parsed objects have a `null` prototype.

The four schemas under `schemas/frontmatter/` (`agent`, `skill`, `workflow`, `rule`) require `format: agent-kit/v1`, `name` and `description`, forbid unknown keys, and allow extension keys `x-<name>`. Shared definitions live in `schemas/common.schema.json` (`urn:agent-kit:common:v1`). No schema defines a `model` field or names a vendor or model; `tier` is an abstract effort level. `check --self` validates every catalog file against its schema, requires `name` to match the file or folder name, and keeps skills and workflows in one namespace. If the schemas fail to load, every catalog file fails (fail closed).

### Cortex envelopes

Agents exchange work through nine small, domain-neutral messages, defined as `schemas/cortex/<kind>.schema.json` with `$id` `urn:agent-kit:cortex:<kind>:v1`. Shared definitions live in `schemas/cortex/defs.schema.json` (`urn:agent-kit:cortex:defs:v1`). The work item can be a spec, a brief or a campaign.

Every envelope requires `schema` (const `cortex.<kind>/v1`), `id` (UUID), `created_at` (RFC 3339 UTC, uppercase `T` and `Z`), `producer`, `work_item` and `body`; `parent_id` and `correlation_id` are optional. Unknown properties are rejected. The header is repeated in each file through `$ref`, because the schemas stay inside the keyword subset (no `allOf`, `if`, `then`, `else`, `not`, `contains`).

| Envelope | Purpose | Typical emitter |
|---|---|---|
| `cortex.task/v1` | Assigns work: instructions, acceptance criteria, allowed scope, inputs and optional budget | Orchestrator |
| `cortex.result/v1` | Reports the outcome of a task: status, changes, evidence per criterion and optional usage | Implementer or worker agent |
| `cortex.blocked/v1` | Stops work and asks a question, with up to four options | Any worker agent |
| `cortex.verdict/v1` | Review decision (`approved`, `rejected`, `escalate`) with findings and checked criteria | Validator or reviewer |
| `cortex.plan/v1` | Breaks work into ordered steps, with mode, agent limit and dependencies | Orchestrator or planner |
| `cortex.handoff/v1` | Passes unfinished work to another agent or session: done, next, open questions | Agent that stops early |
| `cortex.lesson/v1` | Records a reusable lesson with tags, scope and confidence | Any agent after a run |
| `cortex.design/v1` | Proposes design artifacts for a lane, with status `proposed`, `promoted` or `rejected` | Designer agent |
| `cortex.observation/v1` | Reports a run signal (stall, loop, budget, error, summary) with optional numeric metrics | Monitor or runner |

#### Rules the schemas do not encode

These rules need cross-field checks that the validator subset cannot express. The schemas do not try to encode them. `agent-kit validate` (spec-06) enforces them:

- A `rejected` verdict needs at least one `blocker` or `major` finding.
- `plan.steps[].depends_on` points to existing step ids, with no cycles. The ids of steps, `blocked.options`, `verdict.findings` and `task.acceptance` are unique within their list.
- `mode: sequential` implies `max_agents` 1.
- `parent_id` differs from `id`.

#### Size bound

Any valid envelope, serialized as compact JSON (no spaces), is at most 64 KiB (65,536 bytes). The limits make this hold by design: every string has `maxLength`, every array has `maxItems`, and every object is closed (`additionalProperties: false`; `body.metrics` is closed by `patternProperties` and `maxProperties` instead). A test computes the worst case per kind with this model:

- A string costs 6 bytes per `maxLength` unit plus 2 (UTF-8 takes up to 4 bytes per code point, and an escaped control character takes 6). A `const` or `enum` string costs its longest value plus 2.
- A number costs 24 bytes and a boolean 5.
- An object costs 2 plus, for every declared property (required or optional), the key length, 3 for quotes and colon, the value cost and 1 for the comma.
- An array costs 2 plus `maxItems` times (element cost plus 1). `$ref` is followed, and `oneOf`/`anyOf` take the largest branch.
- The only object with `patternProperties` is `body.metrics`: it costs its key bound of 64 characters (from the pattern `{0,63}` after one leading letter) times `maxProperties`, plus the value cost. Any other `patternProperties` object, and any node without a finite bound, costs `Infinity` and fails the test.

The largest kind is `task` (53,420 bytes); `observation` is the smallest (11,059 bytes).

### Compatibility rule

`cortex.*/v1` schemas follow SemVer and the `$id` carries the major. A published schema is compatible when every instance valid under the published version stays valid under the new one.

- **Compatible (same major):** relaxing a limit, or adding an `enum` value.
  Readers must update before producers: an older reader that validates against the published schema rejects an instance that uses a relaxed limit or a new `enum` value, so a compatible change is rolled out to consumers first.
- **Needs a new major in a new file (`...:v2`):** tightening a limit, removing an `enum` value, or adding a property. Schemas use `additionalProperties: false`, so older readers would reject instances that carry the new property.

A `v1` schema is never edited in an incompatible way after its first release: an incompatible change always ships as `v2` in a new file (for example `schemas/cortex/task.v2.schema.json`), and `v1` stays as published.

An automatic guard for this rule (valid fixtures of a published version are append-only and must stay valid) is planned for spec-07.
