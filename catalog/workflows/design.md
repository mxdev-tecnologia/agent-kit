---
format: agent-kit/v1
name: design
description: Decide the technical approach and the closed list of files a spec may change.
argument-hint: <spec path>
agents: [architect, scout]
---

# Design

## Objective
Fix the approach, the contracts and the closed file list that authorizes writes for the build.

## Inputs
- The approved requirements and criteria of the spec.
- The existing code and docs the spec lists as context.

## Steps
1. Ask the scout for the relevant modules, patterns and tests; read summaries only.
2. List credible approaches; for a real fork use `design-lanes`.
3. Choose one and record why, in a few lines.
4. Define contracts, data shapes and error paths that the criteria need.
5. Write the closed file list: every file to create or change, including tests and docs.
6. Check that every requirement maps to at least one file and every file serves a requirement.
7. Record decisions and out-of-scope items in the spec.

## Outputs
- The Design section of the spec, with the closed file list.
- A `cortex.design/v1` envelope when a tool consumes the design.
- A `cortex.blocked/v1` envelope when the design does not close.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- The design needs more files than the spec can reasonably hold; propose a split.
