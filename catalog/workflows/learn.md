---
format: agent-kit/v1
name: learn
description: Record reusable lessons after a run so the next run starts better.
argument-hint: <run, spec or incident>
agents: [observer, orchestrator]
---

# Learn

## Objective
Capture what happened, why and what to do next time, in the repository.

## Inputs
- The spec, its notes and the verdict.
- The failures and corrections of the run.

## Steps
1. List events that cost time or caused rework.
2. Keep only lessons that change future behavior.
3. For each: what happened, why, and the rule to apply next time.
4. Check for duplicates and link to existing records; see `project-memory`.
5. Propose where each lesson lives: a rule, a skill, the project instructions or a decision record.
6. Do not include secrets or personal data.

## Outputs
- One or more lesson records in the repository.
- A `cortex.lesson/v1` envelope per lesson.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- A lesson implies changing a rule, a skill or the process; the human approves it.
- Removing old records is proposed.
