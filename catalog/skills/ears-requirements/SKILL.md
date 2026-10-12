---
format: agent-kit/v1
name: ears-requirements
description: Write functional and non-functional requirements in EARS form inside a spec that follows the agent-kit Spec format. Use when drafting or reviewing the requirements of a spec.
---

# EARS requirements

EARS (Easy Approach to Requirements Syntax) keeps each requirement short, testable and unambiguous. Each requirement has one subject, one obligation and one observable result.

## Patterns

| Pattern | Form |
|---|---|
| Ubiquitous | `THE <subject> SHALL <response>` |
| Event | `WHEN <trigger>, THE <subject> SHALL <response>` |
| State | `WHILE <state>, THE <subject> SHALL <response>` |
| Optional | `WHERE <feature is present>, THE <subject> SHALL <response>` |
| Unwanted | `IF <condition>, THEN THE <subject> SHALL <response>` |

Write one requirement per item. If a sentence needs "and" between two results, split it.

## Writing rules

- Use `SHALL` for obligations. Avoid "should", "may", "etc." and "fast".
- Make non-functional requirements measurable: a number, a limit and the way it is verified.
- Name the subject (`THE SYSTEM`, `THE CLI`, a component), never "it".
- Do not describe the solution; describe the observable behavior. Design goes in the Design section.

## Spec format

A spec is a Markdown file that tools can validate. Follow these rules exactly:

- **Header.** A line `- **Status:** <value>` before the first `##` heading is required. Level, risk, dependencies and branch lines are recommended.
- **Sections.** Level-2 headings with this exact text: `Functional requirements`, `Non-functional requirements`, `Acceptance criteria`, `Traceability matrix`. Other sections are free.
- **Requirement line.** `- **RF-NN:**` or `- **RF-NN (label):**` followed by text; the same for `RNF`. Bold lines that are not list items are ignored. Continuation lines belong to the previous item.
- **Criterion line.** `- **CA-NN** (RF-NN, RNF-NN) — **Given** ... **When** ... **Then** ...`. The parenthesis lists the covered requirement ids.
- **Matrix.** A Markdown table whose first column is the requirement id and second column the criterion ids, comma-separated. Header and separator rows are skipped.
- **Ids.** Numeric with at least two digits, unique and sequential from 01 inside each family (`RF`, `RNF`, `CA`).
- **EARS check.** Lexical only: the requirement starts with `THE <subject>`, `WHEN`, `WHILE`, `IF` or `WHERE`, and contains the word `SHALL`. Non-functional lines need no EARS check.

A complete minimal example is in [spec-example.md](references/spec-example.md). Start from it.

Related skills: `acceptance-criteria` for the Given/When/Then lines, `traceability` for the matrix.
