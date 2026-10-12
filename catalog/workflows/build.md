---
format: agent-kit/v1
name: build
description: Implement the planned tasks inside the closed file list and run the project gate.
argument-hint: <spec path>
agents: [builder, runner]
---

# Build

## Objective
Turn the plan into working, tested code and report the result with evidence.

## Inputs
- The approved spec, its plan and the project checklist.
- The files of the Design, read by range.

## Steps
1. Confirm the branch and the clean state of the worktree.
2. Set the spec status to in progress when you start.
3. For each task: write the code and a test for each automatable criterion, then tick the task.
4. Touch only files on the list. If another file is needed, stop.
5. Run the project gate with output redirected to a file; read the summary and errors only.
6. Fix failures at the cause. Never skip or weaken a test.
7. Commit in small steps with explicit files and the `commit-format` rule; never push.
8. Write deviations and notes in the spec.

## Outputs
- Committed code and tests on the work branch.
- A `cortex.result/v1` envelope with status, files and gate summary.
- A `cortex.blocked/v1` envelope when stopped.
- A `cortex.handoff/v1` envelope when the work must continue in another session.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- Anything the spec does not settle and that changes behavior.
- The gate fails for a reason outside the closed list.
