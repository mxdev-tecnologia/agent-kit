---
format: agent-kit/v1
name: acceptance-criteria
description: Write acceptance criteria in Given/When/Then form, each with one verification method. Use when a spec needs testable pass or fail conditions.
---

# Acceptance criteria

An acceptance criterion states how to tell, with evidence, that a requirement is met.

## Form

```text
- **CA-NN** (RF-NN) — **Given** <context>, **When** <action>, **Then** <observable result>. *Verification:* <method>
```

- **Given** sets up a concrete state. **When** is one action. **Then** is an observable result with a value, a status or a message.
- Add **And** clauses sparingly, only for closely related results.
- The parenthesis lists every requirement the criterion covers. Every requirement is covered by at least one criterion.

## Verification methods

| Method | Use when |
|---|---|
| `test <file>` | The check is automatable, fast and deterministic. |
| `command <cmd>` | A command and its exit code or output prove it. |
| `manual` | A person must read or try it; mark it pending until done. |

Prefer tests. Name the test after the criterion, for example `test_ca_03_rejects_long_name`.

## Checklist

- Is the result observable without reading the code?
- Is there a number, a status or an exact message, not "works well"?
- Does it cover the error path as well as the happy path?
- Is it independent of other criteria and of external services?
- Is the verification method named?

Related skills: `ears-requirements`, `traceability`, `verification-evidence`.
