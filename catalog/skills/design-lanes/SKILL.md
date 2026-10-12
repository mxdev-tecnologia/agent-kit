---
format: agent-kit/v1
name: design-lanes
description: Explore several design alternatives in parallel lanes and promote one with a recorded reason. Use when an interface or technical design has more than one credible approach.
---

# Design lanes

A lane is an independent attempt at the same design problem. Lanes let you compare real alternatives instead of defending the first idea.

## Rules

- Use two or three lanes; more rarely adds value.
- Give every lane the same brief: goal, constraints, closed list of files, and what to deliver.
- Lanes do not share files and do not read each other's work until comparison.
- Each lane produces a short proposal, a design envelope and the trade-offs it accepts.
- Compare against the criteria of the spec first, then simplicity, risk and cost to change.
- Promote one lane. Record why the others lost in the spec notes. Discard the rest.
- Promotion changes only the chosen lane's files; nothing outside the closed list.
- Stop and ask the human when no lane clearly wins or when the winner changes scope or a contract.

A brief template is in [lane-brief.md](references/lane-brief.md).

Related skills: `task-breakdown`, `project-memory`.
