---
format: agent-kit/v1
name: critique
description: Review a change or document and report findings by severity.
argument-hint: <diff, file or spec path>
agents: [reviewer, security]
---

# Critique

## Objective
Give an honest, evidence-based review that helps the author improve the work.

## Inputs
- The artifact to review: a diff, a document or a spec.
- The spec criteria and the project checklist.

## Steps
1. State what the artifact is meant to do.
2. Check it against the criteria and the project checklist.
3. Look for correctness, missing cases, unclear text, risk and needless complexity.
4. Ask the security agent to review sensitive areas.
5. Write findings with severity (blocker, major, minor), location and a suggested fix.
6. Say what is good; be specific.
7. Give a verdict: approve, approve with comments or request changes.

## Outputs
- A list of findings and a decision.
- A `cortex.verdict/v1` envelope.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- A finding would require a change of scope, design or contract.
- The author and the reviewer disagree after one round.
