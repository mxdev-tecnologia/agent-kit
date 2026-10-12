---
format: agent-kit/v1
name: progress
description: Report status, stalls and budget use across the active specs.
argument-hint: <spec or batch>
agents: [observer]
---

# Progress

## Objective
Give the human a short, accurate picture of where work stands.

## Inputs
- The specs in flight, their status and tasks.
- The branches and recent commits.
- The budget notes, if any.

## Steps
1. List active specs with status and ticked tasks.
2. Detect stalls: a spec without progress, a pending question, a failing gate.
3. Note conflicts between parallel specs.
4. Note budget use if tracked; see `context-budget`.
5. Report in a few lines per spec: status, next step, blocker.
6. Change nothing; this workflow only reads.

## Outputs
- A short report.
- A `cortex.observation/v1` envelope with the findings.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- A stall needs a decision on scope, order or priority.
- Parallel specs conflict.
