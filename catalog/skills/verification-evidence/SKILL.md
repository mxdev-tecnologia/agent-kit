---
format: agent-kit/v1
name: verification-evidence
description: Decide what counts as evidence for a criterion and refuse to call work done without it. Use before reporting completion or issuing a verdict.
---

# Verification evidence

Work is done only when each criterion has evidence a reviewer can check.

## What counts

- A command with its exit code and the relevant lines of output.
- A named test that ran and passed, from a run you executed now.
- A reviewed artifact: a file, a diff or a screenshot, with its path.

## What does not count

- "It should work", reading the code, or a past run.
- A test that was skipped, or that passes without checking the behavior.
- A summary written by another agent that you did not check.

## Procedure

1. List the criteria and their verification methods.
2. Run the gate and the specific tests. Redirect long output to a file and read the summary and the errors.
3. For each criterion, record pass, fail or pending-manual, with a reference.
4. Check the negative case: would the test fail if the behavior were wrong?
5. Report a verdict with the findings, ordered by severity. Do not weaken a criterion to pass.

Related skills: `acceptance-criteria`, `traceability`, `context-budget`.
