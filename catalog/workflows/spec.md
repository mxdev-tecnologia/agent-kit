---
format: agent-kit/v1
name: spec
description: Write a spec in the agent-kit Spec format and submit it for review before any build.
argument-hint: <spec title or request>
agents: [orchestrator, architect, doc-writer, reviewer]
---

# Spec

## Objective
Produce a reviewed, approved spec with requirements, criteria and a traceability matrix.

## Inputs
- The triage result (level and risk).
- The request and any linked tickets or documents.
- The context sections of the project docs that the request touches.

## Steps
1. Create the work branch `feature/spec-NN-slug` from the base branch and a spec file in the project's specs folder.
2. Write the header. A line `- **Status:** rascunho` must come before the first `##` heading. Add level, risk, dependencies and branch lines.
3. Write the sections, with these exact level-2 headings: `Functional requirements`, `Non-functional requirements`, `Acceptance criteria`, `Traceability matrix`. Add Context, Design, Tasks and Out of scope as needed.
4. Requirements: `- **RF-NN:**` or `- **RF-NN (label):**`, each starting with `THE <subject>`, `WHEN`, `WHILE`, `IF` or `WHERE` and containing `SHALL`. Make non-functional ones measurable.
5. Criteria: `- **CA-NN** (RF-NN) — **Given** ... **When** ... **Then** ...` with a verification method.
6. Matrix: a table whose first column is the requirement id and second column the criterion ids.
7. Ids are numeric, at least two digits, unique and sequential from 01 in each family.
8. Have the architect fill Design with a closed file list (see `design`).
9. Ask the reviewer to check the spec. Fix findings; after two rejected cycles, stop.
10. Set the status to approved only after the human agrees.

The skills `ears-requirements` and `acceptance-criteria` hold the patterns and a complete example.

## Outputs
- A spec file that follows the Spec format and passes the validator.
- A `cortex.blocked/v1` envelope when a decision is needed.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- Two review cycles in a row were rejected.
- Approval of the spec is required before build; never approve on your own.
