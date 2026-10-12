---
format: agent-kit/v1
name: ui-lanes
description: Explore interface alternatives in parallel lanes and promote one.
argument-hint: <screen or component brief>
agents: [ui-designer, orchestrator]
---

# Ui-lanes

## Objective
Compare two or three interface designs against the same brief and choose one.

## Inputs
- The brief: goal, users, constraints, existing design system.
- The criteria of the spec that concern the interface.

## Steps
1. Write one brief shared by all lanes; see `design-lanes`.
2. Start two or three lanes in parallel, each with its own files.
3. Each lane delivers a proposal: layout, states (empty, loading, error), accessibility notes and trade-offs.
4. Compare against the criteria, then consistency with the design system, simplicity and cost to change.
5. Present the comparison to the human with a recommendation.
6. Promote the chosen lane and record why the others lost.

## Outputs
- A comparison and the promoted lane in the spec notes.
- A `cortex.design/v1` envelope for the chosen design.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- No lane clearly wins.
- The chosen lane changes scope, a contract or the design system.
