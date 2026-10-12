---
format: agent-kit/v1
name: traceability
description: Keep a matrix that links each requirement to criteria, verification, files and evidence. Use when writing a spec, building it or validating a delivery.
---

# Traceability

The traceability matrix proves that every requirement is covered and that every claim has evidence.

## Matrix

| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|

- First column: the requirement id (`RF-NN` or `RNF-NN`). Second column: the criterion ids, comma-separated.
- Verification: `test`, `command`, `manual` or a combination. Mark a pending manual check as pending.
- Files: the files that implement or test the requirement.
- Evidence: filled after the build, with a short reference such as a test name or a command and its result.

## Checks

- Every requirement appears in the matrix.
- Every criterion appears under at least one requirement, and covers only requirements that exist.
- Ids are unique and sequential from 01 in each family.
- No evidence cell stays empty at delivery, except a manual check explicitly marked pending.

## Procedure

1. When drafting: fill the first three columns and the files.
2. While building: keep files accurate.
3. At verification: fill the evidence column and note gaps.

A template is in [matrix-template.md](references/matrix-template.md).

Related skills: `acceptance-criteria`, `verification-evidence`.
