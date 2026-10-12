---
format: agent-kit/v1
name: task-breakdown
description: Split an approved spec into small ordered tasks with dependencies and safe parallel limits. Use when planning the build of a spec.
---

# Task breakdown

Turn an approved spec into a plan that one builder can execute step by step.

## Rules

- One task, one focused change and one commit when possible. A task touches few files, all on the closed list of the spec.
- Order tasks by dependency: contracts and data first, behavior next, tests with the behavior, docs last.
- Every task names the criteria it serves and how it will be checked.
- Mark tasks that can run in parallel only when they share no file and no output. Cap parallel work at four lines.
- Keep the plan short. A plan longer than about ten tasks usually means the spec should be split.
- Record the plan in the Tasks section of the spec as a checklist, and emit it as a plan envelope when a tool needs it.

## Procedure

1. List the files of the Design and the criteria of the spec.
2. Group changes by file and by criterion.
3. Order by dependency; add a final task for the gate.
4. For each task write: goal, files, criteria, check.
5. Flag any task that needs a file outside the list, and stop for a decision.

A template is in [task-template.md](references/task-template.md).

Related skills: `traceability`, `context-budget`.
