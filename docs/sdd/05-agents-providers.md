# Spec 05 — Agents and provider catalog

- **Status:** em andamento
- **Nível:** lite
- **Risco:** médio
- **Depende de:** spec-02a, spec-02b
- **Épico:** agent-kit v1
- **Branch:** feature/spec-05-agents-providers
- **Jira:** —
- **PR:** —
- **Versão:** —
- **ADR:** —
- **Contexto:** `docs/ARCHITECTURE.md`, `docs/sdd/02a-contracts-core.md`, `docs/sdd/02b-cortex-envelopes.md`, `docs/sdd/03-installer.md`, `docs/sdd/04-sdd-brain.md`, `AGENTS.md`

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)

## Context
This spec defines who does the work (thirteen agent roles) and where the work can run (a catalog of providers with concurrency limits). The agents are plain Markdown files with the agent frontmatter of spec-02a; they name an abstract `tier` (fast, standard, deep) and never a model. The provider catalog maps nothing to concrete models by default: each provider has optional native hints per tier, empty by default, which the user may fill in.

Delivery validation is done by spec-checker (level "lite"; content plus one small schema).

**Parallel execution (Merge order).** Specs 03, 04, 05 and 06 run in parallel from `develop`. This spec touches only `catalog/agents/`, `catalog/providers.json`, `schemas/catalog/`, its tests and fixtures, and one new section at the end of `docs/ARCHITECTURE.md`. `docs/ARCHITECTURE.md` is also edited by spec-03 (Install model, Layout, lock, collisions) and spec-06 ("Rules the schemas do not encode"): each spec edits only its own section, and the later merge resolves any conflict by merging `develop`. It does NOT touch `src/` or `src/commands/check-self.ts`, to avoid conflicts with spec-03. The agent names must stay out of the collision list of spec-03 (`src/catalog/collisions.ts`, frozen at its approval, with the reserved Windows names); spec-03 verifies that in `check --self` after the merge, and this spec's test checks the same list (copied into the test as a constant). Spec-03 installs `catalog/providers.json` as `.agents/providers.json`; users override it in `.agents/local/providers.json` (documented here; merging is roadmap).

## Functional requirements
**Agents**
- **RF-01:** THE SYSTEM SHALL provide exactly thirteen agents in `catalog/agents/<id>.md`: `orchestrator`, `scout`, `planner`, `architect`, `builder`, `verifier`, `reviewer`, `ui-designer`, `doc-writer`, `runner`, `security`, `releaser` and `observer`.
- **RF-02:** THE SYSTEM SHALL give each agent frontmatter valid against the agent schema of spec-02a, with `format: agent-kit/v1`, `name` equal to the file name, `title`, `description`, `capabilities`, `tier` and `emits`.
- **RF-03:** THE SYSTEM SHALL set `title` to the full job title of the role (for example `ui-designer` is "UX/UI Specialist"), with the titles listed in Design.
- **RF-04:** THE SYSTEM SHALL set `verifier: true` for exactly `verifier`, `reviewer` and `security`, and these three SHALL NOT have the `edit` capability.
- **RF-05:** THE SYSTEM SHALL list in `emits` only envelope references of the form `cortex.<kind>/v1` with a kind among the nine envelopes of spec-02b, and every agent with `verifier: true` SHALL emit `cortex.verdict/v1`.
- **RF-06:** THE SYSTEM SHALL write each agent body with the sections Role, Goal, Backstory (at most three sentences), Operating rules and Expected output, and SHALL NOT use a persona name or a personality (reviewed manually) or a denylisted name (RNF-01).

**Providers**
- **RF-07:** THE SYSTEM SHALL provide `catalog/providers.json` with `format: agent-kit-providers/v1`, `global_max_agents: 10` and the providers listed in Design.
- **RF-08:** THE SYSTEM SHALL provide `schemas/catalog/providers.schema.json` (`$id` `urn:agent-kit:catalog:providers:v1`) that validates the file: each provider has `id`, `title`, `kind` (`cli` or `endpoint`), `concurrency` (`recommended` and `max`), `tiers` (optional keys `fast`, `standard`, `deep`, each a string) and `capabilities`; a `cli` provider requires `command` and an `endpoint` provider requires `base_url_env`.
- **RF-09:** THE SYSTEM SHALL leave every `tiers` value of the shipped `providers.json` empty, meaning "use the CLI default", and SHALL NOT name a model there.
- **RF-10:** THE SYSTEM SHALL ensure, in a test, that for every provider `recommended` ≤ `max` ≤ `global_max_agents`, that provider ids are unique, and that `global_max_agents` is at most 10 (the maximum of `cortex.plan/v1` `max_agents`).
- **RF-11:** THE SYSTEM SHALL add fixtures for the providers schema to the conformance harness of spec-02a.
- **RF-12:** THE SYSTEM SHALL document the provider catalog in `docs/ARCHITECTURE.md`: fields, the meaning of `tiers`, the concurrency limits, the `.agents/providers.json` copy and the `.agents/local/providers.json` override (merge not implemented yet).

## Non-functional requirements
- **RNF-01 (provider neutrality):** no agent file contains a denylisted name of spec-02a (models, vendors, CLI products) as a whole word, and no `tiers` value in `providers.json` names a model. Provider ids, titles, commands and environment variable names are exempt because they identify the provider. Verified by a scanning test with a self-test that catches a planted word.
- **RNF-02 (compatibility / format):** every agent validates against the agent schema and `providers.json` against its schema, with `name` equal to the file name. Verified by tests and by `check --self`.
- **RNF-03 (security / bounded input):** the providers schema uses only the keyword subset of spec-02a; every string has `maxLength` (a `const` or `enum` string is exempt), every array has `maxItems`, every object has `additionalProperties: false`, every number has `minimum` and `maximum`. `base_url_env` holds the name of an environment variable, never a URL or a secret. Verified by a structural test.
- **RNF-04 (maintainability / size):** each agent file has at most 120 lines. Verified by a test.
- **RNF-05 (reliability / conformance):** the own validator and `ajv` agree on 100% of the providers fixtures, with at least 1 valid and 3 invalid fixtures, one invalid per category (missing required field, invalid enum value, extra property). Verified by the harness.
- Authorization / isolation, LGPD, performance, cost: none. The files are static; they hold no credential, endpoint address or personal data.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** `catalog/agents/`, **When** the test lists it, **Then** it holds exactly the thirteen expected files. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-02** (RF-02, RNF-02) — **Given** each agent, **When** the frontmatter is parsed and validated, **Then** it passes the agent schema, `name` equals the file name and `emits` is present. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-03** (RF-03) — **Given** each agent, **When** the test compares `title` with the table in Design, **Then** all thirteen match, and `ui-designer` is "UX/UI Specialist". *Verification:* test `tests/catalog-agents.test.ts`
- **CA-04** (RF-04) — **Given** the thirteen agents, **When** the test reads `verifier`, **Then** it is `true` for `verifier`, `reviewer` and `security`, absent or `false` for the rest, and the three have no `edit` capability. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-05** (RF-05) — **Given** each agent, **When** the test checks `emits`, **Then** every item matches `cortex.<kind>/v1` with a kind among the nine envelopes, and each `verifier: true` agent includes `cortex.verdict/v1`. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-06** (RF-06) — **Given** each agent body, **When** the test reads the headings, **Then** Role, Goal, Backstory, Operating rules and Expected output appear in that order, and Backstory has at most three sentences. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-07** (RF-07) — **Given** `catalog/providers.json`, **When** the test parses it, **Then** it has the format string, `global_max_agents` 10 and the four providers with the values in Design. *Verification:* test `tests/catalog-providers.test.ts`
- **CA-08** (RF-08) — **Given** the providers schema, **When** the registry loads, **Then** it is registered as `urn:agent-kit:catalog:providers:v1`, and `catalog/providers.json` validates; **And** a `cli` provider without `command`, an `endpoint` provider without `base_url_env`, and a provider with both are rejected. *Verification:* test `tests/catalog-providers.test.ts` and fixtures in the harness
- **CA-09** (RF-09, RNF-01) — **Given** `catalog/providers.json`, **When** the test reads `tiers`, **Then** every value is an empty string; **And** a self-test with a planted model name in a `tiers` value is caught. *Verification:* test `tests/catalog-providers.test.ts`
- **CA-10** (RF-10) — **Given** `catalog/providers.json`, **When** the cross-field rules run, **Then** they pass; **And** self-test data with `recommended` > `max`, `max` > `global_max_agents`, a duplicate id and `global_max_agents` 11 each fail. *Verification:* test `tests/catalog-providers.test.ts`
- **CA-11** (RF-11, RNF-05) — **Given** the fixtures in `tests/fixtures/schemas/catalog-providers/`, **When** the harness runs both validators, **Then** results equal the folder expectation, with at least 1 valid and 3 invalid fixtures declared in `cases.json` (missing `id`, `kind` of `socket`, extra property, plus boundary cases `concurrency.max` 0 and 65, an `id` that is not a `name`, duplicate or seven `capabilities`). *Verification:* test `tests/schemas-conformance.test.ts`
- **CA-12** (RF-12) — **Given** `docs/ARCHITECTURE.md`, **When** reviewed, **Then** a "Provider catalog" section describes the fields, `tiers`, concurrency, the `.agents/providers.json` copy and the unimplemented local override. *Verification:* manual (read the section against the RF)
- **CA-13** (RNF-01) — **Given** the files in `catalog/agents/`, **When** the test scans them against the denylist of spec-02a, **Then** none matches; **And** a self-test with a planted denylisted word is caught. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-14** (RNF-03) — **Given** the providers schema, **When** the structural test walks every node, **Then** each `type: string` has `maxLength` (a `const` or `enum` string is exempt, as in spec-02b CA-16), each array has `maxItems`, each object has `additionalProperties: false` and each number has `minimum` and `maximum`; **And** no `base_url_env` value looks like a URL. *Verification:* test `tests/catalog-providers.test.ts`
- **CA-15** (RNF-04) — **Given** each agent file, **When** the test counts lines, **Then** each has at most 120. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-16** (RNF-02) — **Given** the repository, **When** `node dist/cli.js check --self` runs, **Then** it exits 0. *Verification:* command `pnpm --silent build && node dist/cli.js check --self`
- **CA-17** (RF-01) — **Given** the agent ids and the collision lists (constant in the test, same values as spec-03), **When** the test compares them, **Then** no agent id collides. *Verification:* test `tests/catalog-agents.test.ts`
- **CA-18** (RF-06) — **Given** the thirteen agent bodies, **When** reviewed, **Then** none uses a persona name or a personality, and each Role, Goal and Operating rules section is specific to the job title. *Verification:* manual (read the agents against the RF)

## Design
**Files (closed list — this is the write authorization):**
- `catalog/agents/{orchestrator,scout,planner,architect,builder,verifier,reviewer,ui-designer,doc-writer,runner,security,releaser,observer}.md`
- `catalog/providers.json`
- `schemas/catalog/providers.schema.json`
- `tests/catalog-agents.test.ts`, `tests/catalog-providers.test.ts`
- `tests/fixtures/schemas/catalog-providers/{valid,invalid}/*.json` + `cases.json`
- Docs: `docs/ARCHITECTURE.md` (new "Provider catalog" section at the end)
- No change to `src/` (including `check-self.ts`), `package.json` or other specs' files.

**Agents** (`tier`: abstract level; `capabilities` from the common enum; `emits` envelope kinds):

| id | title | tier | capabilities | emits |
|---|---|---|---|---|
| `orchestrator` | Delivery Orchestrator | standard | read, search | task, plan, blocked |
| `scout` | Codebase Reconnaissance Analyst | fast | read, search | result |
| `planner` | Technical Planner | standard | read, search | plan |
| `architect` | Software Architect | deep | read, search, web | design, blocked |
| `builder` | Software Engineer | standard | read, search, edit, shell | result, blocked, handoff |
| `verifier` | Quality Assurance Engineer | standard | read, search, shell | verdict |
| `reviewer` | Code and Spec Reviewer | deep | read, search | verdict |
| `ui-designer` | UX/UI Specialist | standard | read, search, edit, web | design |
| `doc-writer` | Technical Writer | standard | read, search, edit | result |
| `runner` | Build and Test Operator | fast | read, shell | result, observation |
| `security` | Application Security Engineer | deep | read, search | verdict, observation |
| `releaser` | Release Manager | standard | read, search, edit, shell | result, blocked |
| `observer` | Run Observability Analyst | fast | read, search | observation, lesson |

`emits` values are written as `cortex.<kind>/v1`. `verifier: true` only for `verifier`, `reviewer`, `security`. The body gives a short role, goal and backstory, then operating rules (stay in scope, stop and ask in the cases of the `human-in-the-loop` rule, report evidence) and the expected output (which envelope, when).

**Providers (`catalog/providers.json`):**

| id | title | kind | command / env | concurrency (recommended / max) | capabilities |
|---|---|---|---|---|---|
| `claude-code` | Claude Code | cli | `claude` | 2 / 4 | read, search, edit, shell, web, mcp |
| `codex` | Codex CLI | cli | `codex` | 1 / 2 | read, search, edit, shell, web, mcp |
| `antigravity` | Antigravity | cli | `agy` | 2 / 4 | read, search, edit, shell, web, mcp |
| `openai-compatible` | OpenAI-compatible endpoint | endpoint | `CORTEX_OPENAI_BASE_URL` | 1 / 2 | (empty: text only) |

Each provider has a `tiers` object: the keys `fast`, `standard` and `deep` are optional strings (a native hint of the provider); the shipped file sets all three to `""`, meaning the CLI default. The environment variable of the endpoint holds an address supplied by the user at run time; the repository never stores it.

**Schema shape.** Root: `format` (const `agent-kit-providers/v1`), `global_max_agents` (integer 1–10), `providers` (array 1–16). Provider: a `oneOf` of two closed objects, one with `kind` const `cli` and required `command` (pattern `^[a-z0-9][a-z0-9._-]{0,63}$`), one with `kind` const `endpoint` and required `base_url_env` (pattern `^[A-Z][A-Z0-9_]{0,63}$`). Shared fields: `id` is `$ref urn:agent-kit:common:v1#/$defs/name`; `capabilities` is an array of `$ref urn:agent-kit:common:v1#/$defs/capability` with `minItems` 0, `maxItems` 6 and `uniqueItems: true`; `title` (1–80), `concurrency` with integers 1–64, `tiers` (closed object, each value a string of 0–128 characters). Cross-field rules stay in the test (RF-10), not in the schema.

**Decisions made while writing (not specified by the owner; confirm at approval):**
- `verifier` may use `shell` (to run read-only checks) but none of the three validating roles has `edit`; the rule is stated in RF-04.
- The tiers above are proposals (cheap lookup roles `fast`; design and review roles `deep`); the user can change them in `.agents/local/`.
- Provider ids and titles name products on purpose; the neutrality scan covers agents, not `providers.json` (RNF-01), and `tiers` stays empty.
- The collision list of spec-03 is frozen at approval and includes the reserved Windows names; the constant in the test mirrors it.
- A `oneOf` is used for `kind` (it belongs to the supported subset).
- The docs section is added to the end of `docs/ARCHITECTURE.md` to reduce conflicts with spec-03 and spec-06.

## Tasks
- [x] `schemas/catalog/providers.schema.json` and fixtures with `cases.json`
- [x] `catalog/providers.json` and `tests/catalog-providers.test.ts`
- [x] The thirteen agent files
- [x] `tests/catalog-agents.test.ts`
- [x] Docs updated (`docs/ARCHITECTURE.md`, "Provider catalog")

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm --silent lint                                  # exit 0
pnpm --silent typecheck                             # exit 0
pnpm --silent test                                  # all pass, including agents, providers and conformance
pnpm --silent build                                 # exit 0
node dist/cli.js check --self                       # exit 0
pnpm --silent test:smoke                            # all pass, exit 0
```

## Changelog
- **Adicionado:** 13 agentes com cargo completo (por exemplo, "UX/UI Specialist") e catálogo de provedores (Claude Code, Codex, Antigravity e endpoint compatível com OpenAI) com limites de concorrência.
- **Atenção no deploy:** nenhuma

## Out of scope
- The installer and the copy to `.agents/providers.json` (spec-03).
- Merging `.agents/local/providers.json` over the shipped file (roadmap).
- Choosing or naming concrete models for `tiers`.
- Launching or scheduling agents (the catalog only declares limits).
- Workflows and skills (spec-04).

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01, CA-17 | test | `catalog/agents/`, `tests/catalog-agents.test.ts` ||
| RF-02 | CA-02 | test | `catalog/agents/`, `tests/catalog-agents.test.ts` ||
| RF-03 | CA-03 | test | `catalog/agents/`, `tests/catalog-agents.test.ts` ||
| RF-04 | CA-04 | test | `catalog/agents/`, `tests/catalog-agents.test.ts` ||
| RF-05 | CA-05 | test | `catalog/agents/`, `tests/catalog-agents.test.ts` ||
| RF-06 | CA-06, CA-18 | test + manual | `catalog/agents/`, `tests/catalog-agents.test.ts` ||
| RF-07 | CA-07 | test | `catalog/providers.json`, `tests/catalog-providers.test.ts` ||
| RF-08 | CA-08 | test | `schemas/catalog/providers.schema.json`, `tests/catalog-providers.test.ts` ||
| RF-09 | CA-09 | test | `catalog/providers.json`, `tests/catalog-providers.test.ts` ||
| RF-10 | CA-10 | test | `tests/catalog-providers.test.ts` ||
| RF-11 | CA-11 | test | `tests/fixtures/schemas/catalog-providers/`, `tests/schemas-conformance.test.ts` ||
| RF-12 | CA-12 | manual | `docs/ARCHITECTURE.md` ||
| RNF-01 | CA-09, CA-13 | test | `catalog/agents/`, `catalog/providers.json`, `tests/catalog-agents.test.ts`, `tests/catalog-providers.test.ts` ||
| RNF-02 | CA-02, CA-16 | test + command | `catalog/`, `schemas/catalog/` ||
| RNF-03 | CA-14 | test | `schemas/catalog/providers.schema.json`, `tests/catalog-providers.test.ts` ||
| RNF-04 | CA-15 | test | `catalog/agents/`, `tests/catalog-agents.test.ts` ||
| RNF-05 | CA-11 | test | `tests/fixtures/schemas/catalog-providers/`, `tests/schemas-conformance.test.ts` ||

## Execution notes
- Providers schema repeats the shared fields in the two `oneOf` branches through root `$defs` references (title, concurrency, tiers, capabilities); `cases.json` entries for provider-level errors use keyword `oneOf` at `/providers/N` because the validator reports only the combinator error.
- Fixtures: 2 valid and 15 invalid (the required categories plus boundaries).
- Commits: git signing needs an SSH key passphrase unavailable to the subagent, so the work was left staged or unstaged for the caller to commit.

## Validation report
<!-- Filled by the validators (spec review and delivery validation). -->
