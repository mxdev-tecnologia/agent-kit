---
format: agent-kit/v1
name: triage
description: Classify a request as direct, lite or full and rate its risk before any work starts.
argument-hint: <request or ticket>
agents: [orchestrator, scout]
---

# Triage

## Objective
Choose the lightest process that is still safe for a request, and announce the choice in one line.

## Inputs
- The request text.
- The project instructions and workflow configuration.
- A quick look at the code areas the request touches (use the scout).

## Steps
1. Restate the request in one sentence.
2. Ask the scout for the files and areas involved; read only the summary.
3. Rate the size: files touched, lines changed, new behavior or only a fix.
4. Rate the risk: authentication, security, multi-tenant data, personal data, schema or infrastructure changes raise it.
5. Pick the level:
   - **direct**: about 20 lines or less, one or two files, no risk. Branch, edit, gate, pull request.
   - **lite**: focused, about five files or less, low or medium risk. Spec, build, verify, ship.
   - **full**: a feature, a schema, security, multi-tenant data, infrastructure or personal data. Full spec with strict review.
6. Announce the level and the reason in one line.

## Outputs
- One line: level, risk and the next workflow to run (`spec` for lite and full).
- A `cortex.blocked/v1` envelope when the request is too vague to classify.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- The request is ambiguous enough that two levels are plausible.
