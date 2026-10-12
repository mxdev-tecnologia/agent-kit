---
format: agent-kit/v1
name: verify
description: Check a delivery against the criteria, with evidence, and issue a verdict.
argument-hint: <spec path>
agents: [verifier, security, runner]
---

# Verify

## Objective
Confirm that every requirement and criterion is met by evidence, and report findings by severity.

## Inputs
- The spec with its matrix.
- The diff of the work branch, read by file.
- The gate and test results.

## Steps
1. Run the gate and the specific tests; read the summary.
2. For each criterion decide pass, fail or pending-manual, with a reference; use `verification-evidence`.
3. Check the matrix: every requirement covered, ids sequential, evidence filled.
4. Check that only files on the closed list changed and docs were updated.
5. Ask the security agent for a pass when the change touches sensitive areas (`security-audit`).
6. Check commits against `commit-format` and the absence of secrets.
7. Issue a verdict with findings ordered by severity.
8. Fill the evidence column of the matrix.

## Outputs
- A validation report in the spec.
- A `cortex.verdict/v1` envelope with the decision and findings.

## Human stops
Stop and ask the human, with options and a recommendation, when:

- The doubt changes scope, design, a public contract or the data model.
- The spec and the code conflict.
- A file outside the closed list of the spec is needed.
- A new dependency is needed.
- An operation is destructive or hard to undo.
- Two verification cycles in a row failed.
- A finding would require a change of scope, design or contract.
