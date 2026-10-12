---
format: agent-kit/v1
name: evidence-before-done
description: Never report work as done without evidence, such as a passing command, test or reviewed output, tied to each acceptance criterion.
always: true
---

# Evidence before done

- "Done" means every acceptance criterion has evidence: a command and its result, a test that passed, or a reviewed artifact.
- Run the project gate before reporting completion and read its summary, not only its exit code.
- Report what was verified and what was not. An unverified item is stated as unverified, never as passed.
- A criterion that cannot be automated is marked manual and left pending for a human; do not mark it as passed.
- Record the evidence in the traceability matrix of the spec, with a short reference (command, test name, file).
- If the evidence fails, say so plainly. Do not change a criterion to make it pass.
