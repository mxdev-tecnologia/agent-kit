---
format: agent-kit/v1
name: tasks
description: Break an approved spec into a small ordered plan of tasks with checks.
argument-hint: <spec path>
agents: [planner]
---

# Tasks

## Objective
Produce a plan a builder can execute step by step, within the closed file list.

## Inputs
- The approved spec with its Design and criteria.

## Steps
1. Read the spec and list files and criteria.
2. Split into tasks with one focused change each; use `task-breakdown`.
3. Order by dependency; tests go with their behavior; docs last.
4. For each task record goal, files, criteria and check.
5. Mark parallel tasks only when they share no file; cap parallel lines at four.
6. Write the plan in the Tasks section as a checklist.
7. Emit each task as an envelope when a tool needs it.

## Outputs
- A checklist in the Tasks section of the spec.
- A `cortex.plan/v1` envelope with the ordered plan.
- One `cortex.task/v1` envelope per task when requested.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- A task needs a file outside the closed list.
- The plan is longer than about ten tasks; propose splitting the spec.
