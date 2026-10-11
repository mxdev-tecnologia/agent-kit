# ADR-0002 — Own validator for a JSON Schema subset, with an independent oracle in tests

- **Status:** proposed
- **Date:** 2026-10-11
- **Origin:** spec-02a
- **Supersedes:** —

## Context
agent-kit ships JSON Schemas (agent and skill frontmatter, `cortex.*/v1` envelopes) and must validate them at run time through `npx`, in `check --self` and later in `agent-kit validate` (spec-06). ADR-0001 forbids runtime dependencies, because a compromised dependency would reach every project that runs the package. A general-purpose validator such as `ajv` would add itself and its transitive dependencies to every `npx` start.

The schemas are written by this repository, so they need only a small, well-defined part of JSON Schema. A hand-written validator is, however, easy to get subtly wrong, and it needs a verification that does not share its bugs.

## Decision
- Write a validator in TypeScript for a **declared subset** of JSON Schema 2020-12. The supported keyword list is closed and documented in `docs/ARCHITECTURE.md`; any other keyword is a schema load error (fail closed).
- Keep **zero runtime dependencies** (ADR-0001 stands).
- Add `ajv` (exact version, published more than 14 days before use, using `ajv/dist/2020`) **only in `devDependencies`**, as an oracle: conformance tests run every schema fixture through both validators and require identical results. `strict: true` applies to the `ajv` instance only. The oracle shares the `format` functions (`date-time`, `uuid`) with our validator, so it is **not independent for `format`**; those formats are covered by hand-written test vectors. `format` is an **assertion** in our validator (the 2020-12 default is annotation).
- Write frontmatter in a **restricted YAML subset**, parsed by our own small parser (also with zero dependencies). Every accepted document gives the same keys and values as YAML 1.2, so native `SKILL.md` readers see the same data, with one exception: `null`, `~`, dates, floats and non-lowercase booleans are kept as strings (a native YAML reader would type them). Files written in the subset therefore stay readable by the native CLIs; the only difference is typing of those scalars, which agent-kit schemas do not use.
- Changing the supported keyword list requires a spec; adding a runtime dependency still requires a new ADR.

## Consequences
- **Positive:** nothing is added to the `npx` install; the supported surface is small enough to review and to fuzz; the oracle catches divergence from the standard before release.
- **Negative / costs:** we maintain a validator and a YAML-subset parser; schemas cannot use keywords outside the subset (for example `allOf`, `if/then`, `contains`) until a spec extends it; rules that need those keywords move to code validators (spec-06).
- **What changes in code or operation:** `src/schemas/` holds the validator, registry and frontmatter parser; `package.json` gains one exact-version devDependency; the package policy test keeps requiring zero `dependencies`.

## Alternatives considered
| Alternative | Why not |
|---|---|
| `ajv` at run time | A runtime dependency with its own transitive tree in every `npx` start; contradicts ADR-0001. |
| Own validator only, no oracle | No independent verification; shared misunderstandings of the standard would go unnoticed. |
| JSON frontmatter | Incompatible with the native `SKILL.md` frontmatter that the target CLIs read. |
| Full YAML library | A runtime dependency, and it accepts anchors, tags and nested structures that we want to reject. |
