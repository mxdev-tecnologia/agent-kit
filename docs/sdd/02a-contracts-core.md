# Spec 02a — Contracts core: schema validator, common definitions and frontmatter format

- **Status:** em andamento
- **Nível:** completo
- **Risco:** médio
- **Depende de:** spec-01a
- **Épico:** agent-kit v1
- **Branch:** feature/spec-02a-contracts-core
- **Jira:** —
- **PR:** —
- **Versão:** —
- **ADR:** ADR-0002
- **Contexto:** `docs/adr/0002-own-json-schema-subset-validator.md`, `docs/adr/0001-typescript-cli-zero-runtime-deps.md`, `docs/ARCHITECTURE.md`, `docs/sdd/01a-cli-foundation.md`, `.claude/workflow.md`

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)

## Context
agent-kit needs machine-checkable contracts: the frontmatter of agents, skills, workflows and rules, and (spec-02b) the `cortex.*/v1` envelopes. ADR-0001 forbids runtime dependencies, so this spec builds a small validator for a declared subset of JSON Schema 2020-12 (ADR-0002), a schema registry, a restricted YAML frontmatter parser, the common definitions, the four frontmatter schemas and a conformance harness. `ajv` enters only as a development-time oracle in tests.

Delivery validation escalates to spec-validator (level "completo"; `package.json` is a sensitive path and `src/schemas/` is a hotspot in `.claude/workflow.md`).

Merge order: spec 01a is merged. Spec 02b builds on this one and relies on the conformance harness defined here (RF-25).

## Functional requirements
**Validator**
- **RF-01:** WHEN `validate(id, value)` is called with a registered schema `id` and a JSON value, THE SYSTEM SHALL return `{ valid: true }` if the value satisfies the schema and `{ valid: false, errors }` otherwise, without modifying `value`.
- **RF-02:** THE SYSTEM SHALL support exactly these keywords: `$schema`, `$id`, `$ref`, `$defs`, `title`, `description`, `examples`, `default` (annotation only), `type` (a string or a list; values `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`), `const`, `enum`, `properties`, `patternProperties`, `additionalProperties` (boolean or schema), `required`, `maxProperties`, `items` (a schema), `minItems`, `maxItems`, `uniqueItems`, `minLength`, `maxLength` (counted in code points), `pattern` (compiled as a `RegExp` with the `u` flag), `format`, `minimum`, `maximum`, `oneOf`, `anyOf`. `$schema`, `$id` and `$defs` are allowed only at the root of a schema file.
- **RF-03:** WHEN a schema contains a keyword outside the list in RF-02, a root-only keyword (`$schema`, `$id`, `$defs`) below the root, or a keyword with a malformed value (for example `required: "x"`, `type: "int"`, a `pattern` that does not compile, a negative or non-integer `minLength`, an empty `enum`, duplicate `required` names), THE SYSTEM SHALL fail to load that schema with an error that names the file and the JSON Pointer of the keyword.
- **RF-04:** THE SYSTEM SHALL resolve `$ref` only as a local pointer `#/$defs/<name>`, as `<$id>` or as `<$id>#/$defs/<name>` of a schema in the registry; WHEN a `$ref` is remote (`http:`, `https:`, `file:`, relative path), cannot be resolved (including `#/$defs/constructor` when `constructor` is not an own entry of `$defs`), or takes part in a cycle of `$ref`s, THE SYSTEM SHALL fail to load the schema, naming the file and the pointer. Sibling keywords of a `$ref` are evaluated together with the referenced schema.
- **RF-05:** THE SYSTEM SHALL treat `format` as an assertion for strings and support only `date-time` and `uuid` (exact semantics in Design, "Format semantics"); non-string instances pass any `format`; WHEN a schema uses any other `format`, THE SYSTEM SHALL fail to load it, naming the file and the pointer.
- **RF-06:** WHEN a value is invalid, THE SYSTEM SHALL return at most 50 errors, each with `instancePath` (JSON Pointer), `keyword` and `message`, and SHALL truncate to 80 characters (with a trailing `…`) every instance value quoted in a message and every instance property name used in a message or in `instancePath`.
- **RF-07:** THE SYSTEM SHALL look up `properties`, `patternProperties`, `$defs`, `required` names, instance properties and registry `$id`s only through own properties (`Object.hasOwn` or a `Map`), so that the names `__proto__`, `constructor`, `toString`, `hasOwnProperty` and `prototype` never resolve to inherited members.
- **RF-08:** WHEN a node has both `pattern` and `maxLength` and the string is longer than `maxLength`, THE SYSTEM SHALL report the `maxLength` error and SHALL NOT evaluate the `pattern`; WHEN loading a schema, THE SYSTEM SHALL fail if a node with `pattern` has no `maxLength`, or if a `patternProperties` key is not a bounded pattern (no unbounded quantifier) while `additionalProperties` is not `false`.
- **RF-09:** THE SYSTEM SHALL never use `default` to fill, change or add values in the validated instance.

**Registry**
- **RF-10:** WHEN `loadRegistry(dir)` is called, THE SYSTEM SHALL load every `*.schema.json` file under `dir` recursively, index the schemas by `$id`, and compile all `$ref`s.
- **RF-11:** THE SYSTEM SHALL require each schema to declare `$schema` equal to `https://json-schema.org/draft/2020-12/schema` and a unique `$id` that matches its path under `dir`, after normalizing path separators to `/`: `<base>.schema.json` has `$id` `urn:agent-kit:<base with / replaced by :>:v1`, and `<base>.v<N>.schema.json` (N ≥ 2) has `...:v<N>`; a file named `<base>.v1.schema.json` or `<base>.v0.schema.json` is invalid. For example `frontmatter/agent.schema.json` has `urn:agent-kit:frontmatter:agent:v1`. WHEN any rule fails, THE SYSTEM SHALL fail to load, naming the file.
- **RF-12:** WHEN `validate` receives an `id` that is not in the registry, THE SYSTEM SHALL throw an error naming the `id`; THE SYSTEM SHALL accept an `id` with a `#/$defs/<name>` fragment to validate against one definition.

**Frontmatter**
- **RF-13:** WHEN a file starts with an optional UTF-8 byte order mark (accepted and ignored) and a line `---`, and has a later closing line `---`, THE SYSTEM SHALL parse the text between them and return the parsed object plus the body that follows; WHEN there is no opening line or no closing line, THE SYSTEM SHALL return an error (a missing closing line includes the line number of the opening line).
- **RF-14:** THE SYSTEM SHALL parse exactly the YAML subset defined in Design, "Frontmatter grammar", and SHALL reject everything outside it with an error that includes the 1-based line number (the opening `---` is line 1). For every accepted document the keys and values equal what a YAML 1.2 parser gives, except the decided cases: `null`, `~`, dates, floats and non-lowercase booleans stay strings.
- **RF-15:** WHEN the frontmatter has a nested map, an anchor, an alias, a tag (`!`), a duplicate key, a tab in indentation, or a key named `__proto__`, `constructor` or `prototype`, THE SYSTEM SHALL reject it with an error that includes the line number.
- **RF-16:** WHEN the frontmatter block is larger than 16 KiB, THE SYSTEM SHALL reject it before parsing; the block is the raw text between the opening and closing `---` lines (without the BOM and without the delimiter lines), measured in UTF-8 bytes before line-ending normalization; WHEN the same content uses CRLF or LF and both forms are within the limit, THE SYSTEM SHALL produce the same parsed result.

**Schemas**
- **RF-17:** THE SYSTEM SHALL provide `schemas/common.schema.json` (`$id` `urn:agent-kit:common:v1`) with these `$defs`: `name` (`^[a-z][a-z0-9]*(-[a-z0-9]+){0,31}$`, 1–64 characters, equivalent to the intended `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` within the length cap), `description` (string, 1–1024), `semver` (`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$`, `maxLength` 128), `glob` (string, 1–256), `capability` (enum `read`, `search`, `edit`, `shell`, `web`, `mcp`), `tier` (enum `fast`, `standard`, `deep`: an abstract effort level; the mapping to a concrete model belongs to the provider catalog, spec-05) and `envelope-ref` (`^cortex\.[a-z]+/v[0-9]+$`, `maxLength` 64).
- **RF-18:** THE SYSTEM SHALL provide `schemas/frontmatter/{agent,skill,workflow,rule}.schema.json`, each requiring `format` (const `agent-kit/v1`), `name` and `description`, setting `additionalProperties: false`, and allowing extension keys that match `^x-[a-z0-9-]{1,62}$` through `patternProperties` (value: string up to 1024, integer or boolean).
- **RF-19:** THE SYSTEM SHALL define these fields: agent — `title` (full job title, 1–80, required), `capabilities` (unique list of `capability`, at least 1, required), `tier` (required), `emits` (list of `envelope-ref`, optional), `verifier` (boolean, optional, default false: the agent only validates and never changes anything); skill — `capabilities` (optional, same shape) and `user-invocable` (boolean, optional); workflow — `argument-hint` (string up to 120, optional) and `agents` (unique list of `name`, optional); rule — `always` (boolean, default true) and `applies-to` (list of `glob`, optional).
- **RF-20:** THE SYSTEM SHALL NOT define a `model` field, and no file under `schemas/` SHALL contain the name of a model or vendor (denylist in Design) as a whole word, case-insensitive, in any key or string value.

**Repository check**
- **RF-21:** WHEN `agent-kit check --self` runs, THE SYSTEM SHALL load every schema under `<root>/schemas` (never from the installed package) into a registry and report each load error as a failure line with the file path.
- **RF-22:** WHEN `agent-kit check --self` runs, THE SYSTEM SHALL validate the frontmatter of every `catalog/agents/*.md`, `catalog/workflows/*.md`, `catalog/rules/*.md` and `catalog/skills/*/SKILL.md` against `urn:agent-kit:frontmatter:<type>:v1` (`<type>` = agent, workflow, rule, skill), SHALL report a failure line with the file path (and the line number for parse errors) and the error list for each invalid file, SHALL report a skill folder without `SKILL.md` as a failure, and SHALL ignore `.gitkeep`.
- **RF-23:** WHEN `agent-kit check --self` runs, THE SYSTEM SHALL fail if a catalog file's `name` differs from its file name (without `.md`) or, for skills, from its folder name, or if a skill and a workflow share a `name` (the Codex CLI installs workflows as skills, so they share one namespace).
- **RF-24:** WHEN the schema registry fails to load, or lacks `urn:agent-kit:frontmatter:<type>:v1` while catalog files of that type exist, THE SYSTEM SHALL report every catalog file of the affected types as a failure (fail closed). WHEN the catalog directories have no files, THE SYSTEM SHALL pass these checks with 0 files checked.

**Conformance harness**
- **RF-25:** THE SYSTEM SHALL discover on its own every schema in the registry and its fixture folders, and fail when a schema (or, for a schema that has only `$defs`, a `$defs` entry) has no fixtures. Layout: a schema with validation keywords at the root uses `tests/fixtures/schemas/<name>/{valid,invalid}/*.json`; a schema with only `$defs` uses `tests/fixtures/schemas/<name>/<def>/{valid,invalid}/*.json` (validated through the `#/$defs/<def>` fragment). `<name>` is the `$id` without `urn:agent-kit:` and without the version, with `:` replaced by `-`, plus `-v<N>` when N ≥ 2. The folder defines the expected result; each folder needs at least 1 valid and 2 invalid fixtures; each invalid fixture violates exactly one constraint, declared in a `cases.json` next to it as `{ "<file>.json": { "keyword": "...", "instancePath": "...", "errorCount": 1 } }` (`errorCount` defaults to 1) and checked against the own validator. A fixture folder with no matching schema is also a failure.

## Non-functional requirements
- **RNF-01 (security / supply chain):** `package.json` keeps zero `dependencies`; the only new direct package is `ajv` in `devDependencies`, with an exact version. `ajv` brings transitive dev-only packages (at the time of writing `fast-deep-equal`, `fast-uri`, `json-schema-traverse`, `require-from-string`); every version newly added to `pnpm-lock.yaml` was published at least 14 days before implementation, and the lockfile has only registry-npm entries with integrity. Verified by `tests/package-policy.test.ts` (no `dependencies`; `ajv` present only in `devDependencies`, exact) and by `npm view <pkg> time --json` for each new lockfile entry, recorded in Execution notes.
- **RNF-02 (security / fail closed):** an unsupported keyword, a malformed keyword value, an unsupported `format`, a remote, unresolved or cyclic `$ref`, a nested `$id`/`$schema`/`$defs`, an invalid `$id` or `$schema`, a missing `maxLength` next to `pattern` is always a load error and never silently ignored. Verified by tests that load a schema with each violation and expect an error.
- **RNF-03 (performance):** loading all schemas under `schemas/` takes under 50 ms, and validating 1,000 generated instances of about 2 KB against `urn:agent-kit:frontmatter:agent:v1` takes under 500 ms. Method: 3 untimed warm-up runs, then the median of 5 runs, measured on the CI `ubuntu-latest` leg with Node 22; both limits are multiplied by 4 when `process.platform === "win32"`.
- **RNF-04 (observability / privacy):** each validation error has a JSON Pointer, a keyword and a message; a result has at most 50 errors; no message or `instancePath` contains more than 80 characters of an instance value or instance property name, so logs do not leak content.
- **RNF-05 (security / safe parser):** frontmatter above 16 KiB is rejected; the parser never evaluates code or builds custom types; the keys `__proto__`, `constructor` and `prototype` are rejected; parsed objects have a `null` prototype.
- **RNF-06 (security / prototype safety):** the validator, the registry and the schema loader use only own properties (RF-07). Verified by oracle-checked fixtures with the keys `__proto__`, `constructor`, `toString`, `hasOwnProperty`.
- **RNF-07 (security / ReDoS):** every node with `pattern` has a finite `maxLength`; the validator does not evaluate `pattern` when `maxLength` fails; a static test rejects, in every `pattern` and `patternProperties` key under `schemas/`, a group followed by an unbounded quantifier (`*`, `+`, `{n,}`) whose body contains a quantifier or an alternation, two adjacent groups that both have an unbounded quantifier, two adjacent atoms with an unbounded quantifier whose classes overlap (for example `^a*a*a*b$`), backreferences (`\1`, `\k<`) and lookaround (`(?=`, `(?!`, `(?<=`, `(?<!`).
- **RNF-08 (reliability / conformance):** for every schema (or definition, for definition-only schemas) in `schemas/`, the own validator and `ajv` 2020 (`strict: true`, `allowUnionTypes: true`) give the same valid/invalid result on 100% of the fixtures; the expected result comes from the folder and the expected keyword and `instancePath` from `cases.json`. The oracle uses the same format functions as the validator, so it is not independent for `format`; `format` is covered by the test vectors in CA-05.
- **RNF-09 (compatibility):** CRLF and LF inputs give identical results; the tests pass on `windows-latest` (Node 22) and `ubuntu-latest` (Node 22 and 24).
- **RNF-10 (provider neutrality):** no schema file contains a `model` property or a denylisted name (RF-20). Verified by a scanning test with a self-test that catches a planted name.
- **RNF-11 (compatibility / contract):** a published schema is compatible when every instance valid under the published version stays valid under the new one. Relaxing a limit or adding an `enum` value is compatible; tightening a limit, removing an `enum` value or adding a property (the schemas use `additionalProperties: false`, so older readers would reject it) requires a new major in a new file (`...:v2`). The `$id` carries the major (RF-11). An automatic guard is out of scope here (spec-07); this spec records the rule in `docs/ARCHITECTURE.md`.
- Authorization / isolation, LGPD (personal data) and cost: none. This spec adds a local library and files, with no endpoint, no stored data and no paid service.

## Acceptance criteria
- **CA-01** (RF-01, RF-12) — **Given** a registry with a small schema, **When** `validate` runs with a valid and an invalid value, **Then** it returns `valid: true` and `valid: false` with errors, and a deep-frozen input is accepted without error; **And** an unknown `id` throws naming the `id`; **And** an `id` with `#/$defs/<name>` validates against that definition. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-02** (RF-02) — **Given** one schema per supported keyword, **When** each is validated with passing and failing values, **Then** results match the keyword semantics (including `type` lists, `integer`, `maxLength` counting an emoji as 1, `uniqueItems` on objects, `additionalProperties` as boolean and as schema, `patternProperties`, `maxProperties`, `minimum`/`maximum`, `oneOf` and `anyOf`). *Verification:* test `tests/schemas-validator.test.ts`
- **CA-03** (RF-03, RNF-02) — **Given** schemas with `allOf`, `if`, `not`, `contains`, a nested `$id`, a nested `$schema`, a nested `$defs`, `required: "x"`, `type: "int"`, an uncompilable `pattern` (`"("`), `minLength: -1`, an empty `enum`, **When** each is loaded, **Then** loading fails with an error naming the file and the JSON Pointer. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-04** (RF-04, RNF-02) — **Given** schemas using a local `$ref`, a cross-schema `$ref` by `$id` (with and without fragment), a `$ref` with sibling keywords, a remote `$ref` (`https://`), a relative-path `$ref`, an unresolved `$ref`, a cyclic `$ref` pair, and `#/$defs/constructor`, **When** loaded, **Then** the first three resolve and validate (the sibling keyword is enforced); the other five fail to load with file and pointer. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-05** (RF-05, RNF-08) — **Given** these `date-time` vectors, **When** validated, **Then** valid: `2026-01-02T03:04:05Z`, `2026-01-02t03:04:05z`, `2026-01-02T03:04:05.123456Z`, `2026-01-02T03:04:05+02:00`, `2024-02-29T00:00:00Z`, `2026-12-31T23:59:60Z`; invalid: `2026-02-30T00:00:00Z`, `2026-02-29T00:00:00Z`, `2026-13-01T00:00:00Z`, `2026-01-02T24:00:00Z`, `2026-01-02T03:04:60Z`, `2026-01-02T03:04:05`, `2026-01-02 03:04:05Z`, `2026-01-02T03:04:05.Z`, `2026-01-02T03:04:05+24:00`, `2026-01-02T03:04:05+0200`; **And** these `uuid` vectors: valid lower case, UPPER case, mixed case and the nil UUID `00000000-0000-0000-0000-000000000000`; invalid `urn:uuid:` prefix, braces, no hyphens, 35 and 37 characters, a non-hex character; **And** a non-string value passes `format`; **And** a schema with `format: email` fails to load. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-06** (RF-06, RNF-04) — **Given** an array of 200 invalid items, a string value of 500 characters that violates `enum`, and an object with a 500-character unknown key under `additionalProperties: false`, **When** validated, **Then** `errors.length` is 50 for the array, each error has `instancePath`, `keyword` and `message`, and no message or `instancePath` contains more than 80 characters of the value or of the key. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-07** (RF-07, RNF-06) — **Given** fixtures (also run through the oracle) with `additionalProperties: false` and `{"name":"a","constructor":{}}`, `required: ["toString"]` with `{}` (the inline schema also declares `properties.toString`, so `ajv` strict accepts it), `properties` lookups for `__proto__` and `hasOwnProperty` instance keys, and `$ref` `#/$defs/constructor`, **When** validated or loaded, **Then** the first two are invalid, the instance keys are treated as ordinary data, and the `$ref` is a load error. *Verification:* tests `tests/schemas-validator.test.ts` and `tests/schemas-conformance.test.ts`
- **CA-08** (RF-08, RNF-07) — **Given** an inline schema `{"type":"string","maxLength":32,"pattern":"^(a+)+$"}` and a 10,000-character string of `a` ending in `b`, **When** validated, **Then** the result is invalid with only a `maxLength` error and returns in under 100 ms; **And** loading a schema with `pattern` and no `maxLength` fails. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-09** (RNF-07) — **Given** all `pattern` values and `patternProperties` keys under `schemas/`, **When** the static test runs, **Then** none has nested or adjacent unbounded quantified groups, backreferences or lookaround; **And** a self-test with planted `^(a+)+$`, `(a|aa)*`, `(a*)*b`, `(\w+\s?)+`, `(a+)+(b+)+`, `^a*a*a*b$`, `(?=a)a`, `(a)\1` is caught. *Verification:* test `tests/schemas-conformance.test.ts`
- **CA-10** (RF-09) — **Given** a schema with `default` values and a deep-frozen instance missing those properties, **When** validated, **Then** the result depends only on the constraints and the instance is not changed. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-11** (RF-10) — **Given** a temp `schemas/` tree with nested folders and a non-schema file, **When** `loadRegistry` runs, **Then** every `*.schema.json` is indexed by `$id` and the other file is ignored. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-12** (RF-11) — **Given** schemas with a missing `$id`, an `$id` that does not match the path, a duplicate `$id`, a wrong `$schema`, a missing `$schema`, a file `x.v1.schema.json`, and a valid pair `x.schema.json` (`...:x:v1`) and `x.v2.schema.json` (`...:x:v2`), **When** loaded (also with a path that uses `\` separators, as on Windows), **Then** the invalid ones fail naming the file and the valid pair loads. *Verification:* test `tests/schemas-validator.test.ts`
- **CA-13** (RF-13) — **Given** files with a BOM, with no frontmatter, with an opening but no closing `---`, and with a valid block followed by a body, **When** parsed, **Then** the BOM is ignored, the two bad cases return errors (the second with the opening line number), and the body is the text after the closing `---`. *Verification:* test `tests/frontmatter.test.ts`
- **CA-14** (RF-14) — **Given** one frontmatter per accepted construct of the grammar (comments and blank lines, trailing ` # x` comments, plain, single-quoted with `''`, double-quoted with each allowed escape, integers including `-5` and `0`, `true`/`false`, strings for `null`, `~`, `2026-01-02`, `1.5`, `True`, inline lists with quoted commas, `[]`, `[1, true]` (typed as in the rules: integer and boolean), `key: # comment` followed by a block list, a plain scalar with trailing spaces (trimmed), block lists at indent 0 and 2, `|`, `|-`, `>`, `>-`, `#` inside quotes), **When** parsed, **Then** each gives the expected keys, values and types (expected values written by hand from YAML 1.2). *Verification:* test `tests/frontmatter.test.ts`
- **CA-15** (RF-14) — **Given** one frontmatter per excluded construct (empty `key:`, plain scalar with `: `, plain scalar starting with `*`, `&`, `!`, `{`, `@`, `%`, `?`, `:`, `,`, `]`, `}` or a backtick, an unclosed `[a`, `[a] b`, unsupported escape `\q`, a multi-line quoted scalar, block scalar with `+` or an indentation digit, a nested list, a trailing comma in `[a, b,]`, a nested inline list, `+1`, `007`, `0x1F`, `9007199254740992`, `-9007199254740992`, a continuation line after a plain scalar, a more-indented line in a `>` scalar, a block scalar whose first content line is at column 0, a key with a space), **When** parsed, **Then** each is rejected with an error that includes the line number. *Verification:* test `tests/frontmatter.test.ts`
- **CA-16** (RF-15) — **Given** frontmatter with a nested map, an anchor, an alias, a tag, a duplicate key, a tab in indentation, and the keys `__proto__`, `constructor`, `prototype`, **When** parsed, **Then** each is rejected with an error that includes the line number. *Verification:* test `tests/frontmatter.test.ts`
- **CA-17** (RF-16, RNF-05) — **Given** a block of exactly 16 KiB and one of 16 KiB + 1 byte, and a CRLF block whose raw size is above 16 KiB but whose LF-normalized size is below it, **When** parsed, **Then** the first is accepted and the other two are rejected; **And** parsed objects have a `null` prototype. *Verification:* test `tests/frontmatter.test.ts`
- **CA-18** (RF-16, RNF-09) — **Given** the same frontmatter text with LF and with CRLF, **When** parsed, **Then** the results are deeply equal. *Verification:* test `tests/frontmatter.test.ts` (runs on the Windows leg of the CI)
- **CA-19** (RF-17) — **Given** `schemas/common.schema.json`, **When** each definition runs through the harness, **Then** valid and invalid values behave as in RF-17 (including `name` lengths 0, 1, 64, 65, `a--b`, `a-`, `-a`, `A`; `semver` `1.2.3-rc.1+b5`, `01.2.3`; `envelope-ref` `cortex.task/v1`, `cortex.task`). *Verification:* test `tests/schemas-conformance.test.ts` (fixtures in `tests/fixtures/schemas/common/<def>/`)
- **CA-20** (RF-18, RF-19) — **Given** the four frontmatter schemas, **When** valid and invalid fixtures run through the harness, **Then** results match RF-18 and RF-19, including: missing `name`, wrong `format`, an unknown key, an allowed `x-` key, an `X-` key, an agent without `title`, `capabilities` or `tier`, duplicate capabilities, a non-boolean `verifier`. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures in `tests/fixtures/schemas/frontmatter-<type>/`)
- **CA-21** (RF-20, RNF-10) — **Given** the files under `schemas/`, **When** the test scans keys and string values for the denylist, **Then** none matches and none has a `model` property; **And** a self-test with planted `Claude`, `gpt-4` (as a value) and `gemini` (as a key) is caught. *Verification:* test `tests/schemas-conformance.test.ts`
- **CA-22** (RF-21) — **Given** a temp root with an invalid schema in `<root>/schemas`, **When** `check --self --root <dir>` runs, **Then** a failure line names the schema file and the exit code is 1; **And** the repository's own schemas load with exit 0. *Verification:* test `tests/check-self.test.ts`
- **CA-23** (RF-22) — **Given** a temp catalog with one valid file of each type, one file with a parse error, one with a schema error, a skill folder without `SKILL.md` and a `.gitkeep`, **When** `check --self --root <dir>` runs, **Then** the invalid files are listed with path (and line for the parse error) and errors, the skill folder is listed, `.gitkeep` is ignored and the exit code is 1; **And** the valid files alone exit 0. *Verification:* test `tests/check-self.test.ts`
- **CA-24** (RF-23) — **Given** a catalog file whose `name` differs from its file or folder name, and a skill and a workflow with the same `name`, **When** `check --self` runs, **Then** each case is listed and the exit code is 1. *Verification:* test `tests/check-self.test.ts`
- **CA-25** (RF-24) — **Given** a root with catalog files and a broken registry, a root with catalog files and no `frontmatter/agent` schema, and an empty catalog, **When** `check --self` runs, **Then** every affected catalog file is a failure line (exit 1) and the empty catalog exits 0 with 0 files checked. *Verification:* test `tests/check-self.test.ts`
- **CA-26** (RF-25) — **Given** the repository schemas and a temp tree, **When** the harness runs, **Then** it discovers every schema and `$defs` entry, fails when fixtures are missing (fewer than 1 valid or 2 invalid), when an invalid fixture has no `cases.json` entry, when its keyword or `instancePath` differs, when its error count differs, and when a fixture folder has no schema; and it maps `x.v2.schema.json` to the folder suffix `-v2`. *Verification:* test `tests/schemas-conformance.test.ts`
- **CA-27** (RNF-08) — **Given** every schema in `schemas/` and its fixtures, **When** the own validator and `ajv` (`ajv/dist/2020`, `strict: true`, `allowUnionTypes: true`, formats registered from the shared functions) validate each fixture, **Then** the results are identical and equal to the folder's expectation. *Verification:* test `tests/schemas-conformance.test.ts`
- **CA-28** (RNF-01) — **Given** `package.json` and `pnpm-lock.yaml`, **When** the policy test runs, **Then** there are no `dependencies`, `ajv` is in `devDependencies` and only there, with an exact version; **And** each new lockfile package was published at least 14 days before the implementation date (recorded in Execution notes). *Verification:* test `tests/package-policy.test.ts` and command `npm view <pkg> time --json`
- **CA-29** (RNF-03) — **Given** the repository schemas and generated 2 KB instances of `urn:agent-kit:frontmatter:agent:v1`, **When** the performance test runs 3 warm-up and 5 timed runs, **Then** the median load time is under 50 ms and the median time for 1,000 validations is under 500 ms (limits ×4 on `win32`). *Verification:* test `tests/schemas-validator.test.ts`
- **CA-30** (RNF-09) — **Given** the CI matrix, **When** the pull request runs, **Then** all legs (`ubuntu-latest` Node 22 and 24, `windows-latest` Node 22) are green. *Verification:* manual (checks tab of the PR)
- **CA-31** (RNF-04, RNF-05) — **Given** the `src/schemas/` sources, **When** the command runs, **Then** no `eval`, `new Function` or shell call exists. *Verification:* command `! grep -rnE "eval\(|new Function|child_process" src/schemas`
- **CA-32** (RNF-11) — **Given** `docs/ARCHITECTURE.md`, **When** reviewed, **Then** it states the compatibility rule of RNF-11 (valid instances stay valid; what is compatible and what needs v2, including the effect on older readers). *Verification:* manual (read the Architecture note)

## Design
**Files (closed list — this is the write authorization):**
- `src/schemas/validate.ts` — compile and validate (keywords in RF-02), error shape and truncation
- `src/schemas/formats.ts` — the `date-time` and `uuid` checks, shared by the validator and the oracle
- `src/schemas/registry.ts` — `loadRegistry(dir)`, `validate(id, value)`, `$id`, `$schema` and path rules
- `src/schemas/frontmatter.ts` — extraction and YAML-subset parser
- `src/cli.ts` (added with owner approval: catalog file count in the success message)
- `src/commands/check-self.ts` — extended with the schema and catalog checks (RF-21 to RF-24)
- `schemas/common.schema.json`
- `schemas/frontmatter/agent.schema.json`, `schemas/frontmatter/skill.schema.json`, `schemas/frontmatter/workflow.schema.json`, `schemas/frontmatter/rule.schema.json`
- `schemas/.gitkeep` — removed
- `tests/schemas-validator.test.ts`, `tests/frontmatter.test.ts`, `tests/schemas-conformance.test.ts`, `tests/check-self.test.ts` (new cases with a temporary catalog), `tests/package-policy.test.ts` (extended)
- `tests/fixtures/schemas/common/<def>/{valid,invalid}/*.json` + `cases.json`, `tests/fixtures/schemas/frontmatter-<type>/{valid,invalid}/*.json` + `cases.json`
- `package.json`, `pnpm-lock.yaml` — only `ajv` in `devDependencies` (plus its transitive dev packages in the lockfile)
- Docs: `docs/ARCHITECTURE.md` (Contracts section: supported subset, `$id` and path rule, format as assertion, frontmatter grammar summary, compatibility rule, `src/schemas/` layout), `README.md` (only if it mentions the frontmatter), `docs/adr/0002-own-json-schema-subset-validator.md` and `docs/adr/README.md` (drafted with this spec)

**Format semantics.** `format` is an assertion here, unlike the default of JSON Schema 2020-12 (where it is an annotation). `date-time`: `YYYY-MM-DD`, then `T` or `t`, `hh:mm:ss`, an optional fraction `.` plus 1 or more digits, then `Z`/`z` or `±hh:mm`; year `0000`–`9999`; month 01–12; day valid for the month and year (Gregorian leap years); hour 00–23; minute 00–59; second 00–59, or 60 only when the time is 23:59 (leap second); offset hour 00–23 and minute 00–59. `uuid`: 8-4-4-4-12 hexadecimal digits, upper or lower case, the nil UUID allowed, no `urn:uuid:` prefix, no braces; version and variant digits are not checked.

**Frontmatter grammar** (closed; everything else is an error with a line number):
- Line endings: CRLF is normalized to LF after the size check. Blank lines and full-line `#` comments are ignored (outside block scalars). A trailing comment is ` #` after a plain scalar, a quoted scalar or an inline list.
- Keys: `^[A-Za-z][A-Za-z0-9_-]*$` at column 0, followed by `:` and a space or end of line. An indented key line is a nested map (error). `key:` with no value and no list under it is an error (use `''`).
- Plain scalars: non-empty; must not start with `* & ! { } [ ] @ % ` ` | > ' " # , ? :` or `- `; must not contain `: ` or end with `:`; must fit on one line (a more-indented continuation line is an error).
- Single-quoted: `''` is a quote. Double-quoted: escapes `\\ \" \/ \n \t \r \uXXXX` only. Quoted scalars close on the same line.
- Typing: `true`/`false` (lowercase) are booleans; `^-?(0|[1-9][0-9]*)$` up to 2^53−1 is an integer; a plain scalar that matches `^[+-]?[0-9]+$` but is not a valid integer (a leading `+`, a leading zero such as `007`, or a value outside ±(2^53−1)), or that matches `^0[xob]` followed by digits, is an error ("ambiguous number, quote it"); "looks numeric" means exactly these regexes; everything else (`null`, `~`, `True`, `yes`, dates, floats, `1_000`) is a string. Quoted scalars are always strings.
- Block lists: `- scalar` items at indent 0 or 2 (consistent within a list); a nested list, `- key: v` or a bare `-` is an error.
- Inline lists: one line, `[a, b]`; elements are plain scalars (no `, [ ] { }` or `: `) or quoted scalars (commas allowed inside quotes); `[]` is empty; a trailing comma or a nested list is an error.
- Whitespace and comments: trailing spaces of a plain scalar are removed; `key: # comment` followed by a block list is valid (the comment is ignored and the list belongs to the key); a block scalar whose first non-blank content line is at column 0 is an error.
- Inline list typing: elements follow the scalar typing rules (`[1, true]` gives an integer and a boolean; `[]` is an empty list).
- Block scalars: `|`, `|-`, `>`, `>-`; no `+` chomping, no indentation digit, no comment after the indicator; the indentation is that of the first non-blank content line; a less-indented non-blank line ends the scalar; `|` keeps line breaks, `>` folds single breaks into spaces and keeps blank lines as breaks; in a `>` scalar a line indented more than the first is an error.
- Errors: nested maps, anchors (`&`), aliases (`*`), tags (`!`), flow maps (`{`), merge keys, `? ` keys, directives (`%`), extra `---` lines, duplicate keys, a tab in leading whitespace, forbidden keys.
- No YAML oracle exists in dev dependencies (ADR-0001); the property "accepted ⇒ same as YAML 1.2" is verified by hand-written expected values in CA-14.

**Denylist (RF-20), whole words, case-insensitive, tokens split on non-alphanumeric characters:** `claude`, `anthropic`, `opus`, `sonnet`, `haiku`, `gpt`, `openai`, `gemini`, `google`, `llama`, `mistral`, `deepseek`, `grok`, `codex`, `antigravity`.

**Decisions:**
- The supported subset and fail-closed behavior follow ADR-0002. The own validator is the runtime; `ajv` is only an oracle in tests, created with `strict: true` and `allowUnionTypes: true`. Schemas always declare `type` next to type-specific keywords and list every `required` name in `properties`, so strict mode accepts them.
- The oracle registers `date-time` and `uuid` via `ajv.addFormat` with the functions from `src/schemas/formats.ts`, so no `ajv-formats` package is needed.
- Error `message` text is free-form but stable; tests assert `instancePath` and `keyword`, not the full message.
- Keyword additions to the first draft list, needed by spec-02b and the field defaults: `maxProperties`, `default` (annotation) and the type name `integer`.
- `name` uses `{0,31}` instead of `*` in the hyphen group (identical set of strings within the 64-character cap) so that the ReDoS rule in RNF-07 holds.

## Tasks
- [x] `src/schemas/formats.ts` and `src/schemas/validate.ts` with tests (keywords, `$ref`, formats, errors, prototype safety, pattern gate, performance)
- [x] `src/schemas/registry.ts` and its tests (`$id` and path rules)
- [x] `src/schemas/frontmatter.ts` and `tests/frontmatter.test.ts`
- [x] `schemas/common.schema.json` and the four frontmatter schemas, with fixtures and `cases.json`
- [x] `tests/schemas-conformance.test.ts`: harness, `ajv` oracle, static ReDoS test, neutrality scan; `package.json`, `pnpm-lock.yaml`, `tests/package-policy.test.ts`
- [x] `check-self.ts` extension and `tests/check-self.test.ts` cases; remove `schemas/.gitkeep`
- [x] Docs updated (`docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md`; `README.md` needed no change)

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm --silent lint                                  # exit 0
pnpm --silent typecheck                             # exit 0
pnpm --silent test                                  # all pass, including conformance
pnpm --silent build                                 # exit 0
node dist/cli.js check --self                       # exit 0, "OK: repository invariants hold (<root>, 0 catalog files)"
pnpm --silent test:smoke                            # all pass, exit 0
```

## Changelog
- **Adicionado:** validador de JSON Schema (subconjunto declarado), registro de schemas, formato de frontmatter para agentes, skills, workflows e regras, e verificação desses contratos em `agent-kit check --self`.
- **Alterado:** a mensagem de sucesso de `agent-kit check --self` agora informa o número de arquivos do catálogo verificados.
- **Atenção no deploy:** nenhuma

## Out of scope
- The `cortex.*/v1` envelopes (spec-02b).
- The `agent-kit validate` command (spec-06).
- Name-collision checks against native CLI commands and installation (spec-03).
- Catalog content: agents, skills, workflows, rules (specs 04 and 05).
- Any JSON Schema keyword outside the subset in RF-02.
- An automatic compatibility guard for published schemas (spec-07).
- Dependabot cooldown for new package versions (follow-up, outside the spec flow).

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `src/schemas/validate.ts`, `src/schemas/registry.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_01_valid_invalid_frozen_unknown_id_and_fragment` |
| RF-02 | CA-02 | test | `src/schemas/validate.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_02_*` (type, const/enum, string, number, array, object, oneOf/anyOf) |
| RF-03 | CA-03 | test | `src/schemas/validate.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_03_load_error_*` |
| RF-04 | CA-04 | test | `src/schemas/validate.ts`, `src/schemas/registry.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_04_refs_resolve`, `test_ca_04_ref_load_error_*`, `test_ca_04_cyclic_refs_fail` |
| RF-05 | CA-05 | test | `src/schemas/formats.ts`, `src/schemas/validate.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_05_date_time_vectors`, `test_ca_05_uuid_vectors_and_non_strings`, `test_ca_03_load_error_format email` |
| RF-06 | CA-06 | test | `src/schemas/validate.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_06_error_limit_and_truncation` |
| RF-07 | CA-07 | test | `src/schemas/validate.ts`, `src/schemas/registry.ts`, `tests/schemas-validator.test.ts`, `tests/schemas-conformance.test.ts` |  `tests/schemas-validator.test.ts::test_ca_07_prototype_names_are_ordinary_data`; `tests/schemas-conformance.test.ts::test_ca_07_prototype_named_keys_match_the_oracle` |
| RF-08 | CA-08 | test | `src/schemas/validate.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_08_redos_pattern_is_skipped_after_max_length` |
| RF-09 | CA-10 | test | `src/schemas/validate.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_10_default_never_changes_or_fills_the_instance` |
| RF-10 | CA-11 | test | `src/schemas/registry.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_11_loads_nested_tree_and_ignores_other_files` |
| RF-11 | CA-12, CA-26 | test | `src/schemas/registry.ts`, `tests/schemas-validator.test.ts`, `tests/schemas-conformance.test.ts` |  `tests/schemas-validator.test.ts::test_ca_12_id_and_schema_rules`, `test_ca_12_path_separators_are_normalized`; `tests/schemas-conformance.test.ts::test_ca_26_maps_versions_to_folder_suffixes` |
| RF-12 | CA-01 | test | `src/schemas/registry.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_01_valid_invalid_frozen_unknown_id_and_fragment` |
| RF-13 | CA-13 | test | `src/schemas/frontmatter.ts`, `tests/frontmatter.test.ts` |  `tests/frontmatter.test.ts::test_ca_13_*` |
| RF-14 | CA-14, CA-15 | test | `src/schemas/frontmatter.ts`, `tests/frontmatter.test.ts` |  `tests/frontmatter.test.ts::test_ca_14_*`, `test_ca_15_rejects_*` |
| RF-15 | CA-16 | test | `src/schemas/frontmatter.ts`, `tests/frontmatter.test.ts` |  `tests/frontmatter.test.ts::test_ca_16_rejects_*` |
| RF-16 | CA-17, CA-18 | test | `src/schemas/frontmatter.ts`, `tests/frontmatter.test.ts` |  `tests/frontmatter.test.ts::test_ca_17_*`, `test_ca_18_lf_and_crlf_give_equal_results` |
| RF-17 | CA-19 | test | `schemas/common.schema.json`, `tests/schemas-conformance.test.ts`, `tests/fixtures/schemas/common/` |  `tests/schemas-conformance.test.ts::test_ca_19_common_definitions`; `schemas/common.schema.json` |
| RF-18 | CA-20 | test | `schemas/frontmatter/*.schema.json`, `tests/schemas-conformance.test.ts`, `tests/fixtures/schemas/frontmatter-*/` |  `tests/schemas-conformance.test.ts::test_ca_20_frontmatter_schemas` |
| RF-19 | CA-20 | test | `schemas/frontmatter/*.schema.json`, `tests/schemas-conformance.test.ts`, `tests/fixtures/schemas/frontmatter-*/` |  `tests/schemas-conformance.test.ts::test_ca_20_frontmatter_schemas` |
| RF-20 | CA-21 | test | `schemas/**`, `tests/schemas-conformance.test.ts` |  `tests/schemas-conformance.test.ts::test_ca_21_schemas_name_no_model_or_vendor` |
| RF-21 | CA-22 | test | `src/commands/check-self.ts`, `tests/check-self.test.ts` |  `tests/check-self.test.ts::test_ca_22_*`; `src/commands/check-self.ts` (`loadSchemas`) |
| RF-22 | CA-23 | test | `src/commands/check-self.ts`, `tests/check-self.test.ts` |  `tests/check-self.test.ts::test_ca_23_*` |
| RF-23 | CA-24 | test | `src/commands/check-self.ts`, `tests/check-self.test.ts` |  `tests/check-self.test.ts::test_ca_24_names_must_match_files_folders_and_not_collide` |
| RF-24 | CA-25 | test | `src/commands/check-self.ts`, `src/cli.ts`, `tests/check-self.test.ts` |  `tests/check-self.test.ts::test_ca_25_*` |
| RF-25 | CA-26 | test | `tests/schemas-conformance.test.ts`, `tests/fixtures/schemas/**` |  `tests/schemas-conformance.test.ts::test_ca_26_*` (harness self-tests and repository run) |
| RNF-01 | CA-28 | test + command | `package.json`, `pnpm-lock.yaml`, `tests/package-policy.test.ts` |  `tests/package-policy.test.ts::test_ca_28_*`; Execution notes (npm view) |
| RNF-02 | CA-03, CA-04, CA-05, CA-08, CA-12 | test | `src/schemas/validate.ts`, `src/schemas/registry.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_03_*`, `test_ca_04_*`, `test_ca_05_*`, `test_ca_08_*`, `test_ca_12_*` |
| RNF-03 | CA-29 | test | `src/schemas/validate.ts`, `src/schemas/registry.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_29_load_and_validate_within_budget` |
| RNF-04 | CA-06, CA-31 | test + command | `src/schemas/validate.ts`, `tests/schemas-validator.test.ts` |  `tests/schemas-validator.test.ts::test_ca_06_error_limit_and_truncation`; command in CA-31 (no matches) |
| RNF-05 | CA-17, CA-31 | test + command | `src/schemas/frontmatter.ts`, `tests/frontmatter.test.ts` |  `tests/frontmatter.test.ts::test_ca_17_*`; command in CA-31 (no matches) |
| RNF-06 | CA-07 | test | `src/schemas/validate.ts`, `src/schemas/registry.ts`, `tests/schemas-validator.test.ts`, `tests/schemas-conformance.test.ts` |  `tests/schemas-validator.test.ts::test_ca_07_prototype_names_are_ordinary_data`; `tests/schemas-conformance.test.ts::test_ca_07_prototype_named_keys_match_the_oracle` |
| RNF-07 | CA-08, CA-09 | test | `src/schemas/validate.ts`, `tests/schemas-validator.test.ts`, `tests/schemas-conformance.test.ts` |  `tests/schemas-validator.test.ts::test_ca_08_*`; `tests/schemas-conformance.test.ts::test_ca_09_*` |
| RNF-08 | CA-05, CA-26, CA-27 | test | `tests/schemas-conformance.test.ts`, `tests/fixtures/schemas/**` |  `tests/schemas-conformance.test.ts::test_ca_27_oracle_and_own_validator_agree_on_every_fixture`, `test_ca_26_every_schema_and_definition_has_fixtures` |
| RNF-09 | CA-18, CA-30 | test + manual | `tests/frontmatter.test.ts` |  `tests/frontmatter.test.ts::test_ca_18_lf_and_crlf_give_equal_results`; CA-30 pending (CI of the PR) |
| RNF-10 | CA-21 | test | `schemas/**`, `tests/schemas-conformance.test.ts` |  `tests/schemas-conformance.test.ts::test_ca_21_*` (including the planted-name self-test) |
| RNF-11 | CA-12, CA-32 | test + manual | `src/schemas/registry.ts`, `docs/ARCHITECTURE.md` |  `docs/ARCHITECTURE.md:81-86` ("Compatibility rule", CA-32); `tests/schemas-validator.test.ts::test_ca_12_*` for the `$id` major |

## Execution notes
Implementation (Sonnet), 2026-10-11.

- **ajv:** `ajv@8.20.0` (published 2026-04-24), `devDependencies`, exact (`pnpm add -D -E`). New lockfile packages and publish dates (`npm view <pkg> time --json`): `ajv@8.20.0` 2026-04-24; `fast-deep-equal@3.1.3` 2020-06-08; `fast-uri@3.1.8` 2026-09-15 (26 days before implementation); `json-schema-traverse@1.0.0` 2020-12-13; `require-from-string@2.0.2` 2018-04-09. All older than 14 days; all lockfile entries are registry entries with `integrity`.
- **Gate:** lint, typecheck, test (209 tests), build, `check --self`, `test:smoke` all pass.
- **Decisions:**
  - Any `$ref` cycle is a load error, including recursion through `properties` or `items` (the compiler keeps an in-progress set per `$ref` target). `$ref: "#"` and `<id>#` (empty fragment) are load errors.
  - Truncation (RF-06): longer than 80 code points becomes 79 code points plus `…`, so the result has at most 80 characters.
  - Frontmatter block size (RF-16): the block is the raw text from the line after the opening `---` up to the start of the closing `---` line, so it includes the last line terminator.
  - Error order inside one node: `$ref`, `type`, `const`, `enum`, object keywords, array keywords, string keywords, number keywords, `oneOf`/`anyOf`. `cases.json` checks the first error and the total count. `name` with an empty string yields two errors (`minLength`, then `pattern`), so its fixture declares `errorCount: 2`.
  - `check --self` prints one failure line per invalid file with the error list joined by `; `. A missing `schemas/` directory keeps only the existing "missing directory" line (no extra schema line), but catalog files then fail closed.
  - ajv (default options, no `ownProperties`) reads inherited members for property names declared in `properties` (`hasOwnProperty`) when the instance lacks them, and ignores a `properties.__proto__` entry. The oracle fixtures therefore use only instance keys that are present (`constructor`, `__proto__`, `hasOwnProperty`, `toString`) plus the `required: [toString]` case, as in CA-07; the declared-`__proto__` and absent-`hasOwnProperty` cases are covered by the own validator only (`test_ca_07_prototype_names_are_ordinary_data`).
  - Folded block scalars with whitespace-only lines longer than the indentation are rejected (not covered by the grammar, avoids a divergence from YAML 1.2).
- **Deviations from the Design:**
  - `src/cli.ts` was added to the Design with owner approval: the success line is now `OK: repository invariants hold (<root>, N catalog files)`, using `checkSelfReport(root).catalogFiles`; asserted in `tests/check-self.test.ts` (`tests/cli.test.ts` and the smoke test do not check this message).
  - The harness lives inside `tests/schemas-conformance.test.ts` (no helper file in the Design); spec 02b can copy `checkConformance` or move it to a shared helper.
  - CA-30 (CI matrix) and CA-32 (ARCHITECTURE note) have no automatic evidence: CA-30 is the PR checks tab; CA-32 is the "Compatibility rule" section of `docs/ARCHITECTURE.md`.


## Validation report
<!-- Filled by the validators (spec review and delivery validation). -->
