---
format: agent-kit/v1
name: sync
description: Reconcile specs, status and branches after a pull request is merged.
argument-hint: <merged pull request or spec>
agents: [releaser, doc-writer]
---

# Sync

## Objective
Bring specs, status and docs back in line with what was merged.

## Inputs
- The merged pull request and its spec.
- The state of the base branch.

## Steps
1. Fetch the base branch and find merged work branches.
2. Set each merged spec to delivered with the date.
3. Run pending manual checks that the merge made possible and record the result.
4. Update indexes and docs that list specs or status.
5. Report branches that can be cleaned up; delete nothing without approval.
6. Open a small pull request for the status updates.

## Outputs
- Updated specs and indexes in a pull request.
- A `cortex.observation/v1` envelope listing what changed and what is pending.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- A merged change conflicts with another open spec.
- Deleting a branch or file is proposed.
