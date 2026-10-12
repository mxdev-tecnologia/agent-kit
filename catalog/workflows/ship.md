---
format: agent-kit/v1
name: ship
description: Update the docs, open the pull request and hand the delivery to the owner.
argument-hint: <spec path>
agents: [doc-writer, releaser]
---

# Ship

## Objective
Deliver a verified spec as a pull request that the owner can review and merge.

## Inputs
- A verified spec with a passing verdict.
- The list of docs the change affects.

## Steps
1. Update the affected docs on the same branch; follow the project's docs allowlist.
2. Check that no temporary or stray files are staged.
3. Set the spec status to the pull request state.
4. Push the work branch and open a pull request against the base branch, never against the release branch.
5. Write the description: summary, criteria with evidence, pending manual checks, rollout notes.
6. Hand over; do not merge.

## Outputs
- A pull request URL.
- A `cortex.result/v1` envelope with the outcome.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- A push or pull request would target a protected branch.
- A manual check blocks the delivery and needs a decision.
