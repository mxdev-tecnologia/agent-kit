---
format: agent-kit/v1
name: debug
description: Find the cause of a failure before changing code, then fix it with a test.
argument-hint: <failure description or log path>
agents: [scout, builder, runner]
---

# Debug

## Objective
Establish the root cause with evidence, then apply the smallest fix that a test proves.

## Inputs
- The failure: message, command, expected and actual behavior.
- Logs redirected to a file.

## Steps
1. Reproduce the failure with the smallest command; record it.
2. Read the error and the summary of the log, not the whole log.
3. Form one hypothesis at a time and test it with a cheap check.
4. Locate the cause with the scout; confirm it before editing.
5. Write a failing test that captures the bug.
6. Make the smallest fix inside the allowed files; run the test and the gate.
7. Record the cause and what would have caught it earlier.

## Outputs
- A fix with a regression test.
- A `cortex.result/v1` envelope with cause and evidence.
- A `cortex.lesson/v1` envelope when the cause teaches something reusable.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- The fix needs a design or contract change.
- After three failed hypotheses, ask for direction.
