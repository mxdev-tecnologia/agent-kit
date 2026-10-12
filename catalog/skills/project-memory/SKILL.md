---
format: agent-kit/v1
name: project-memory
description: Record decisions, lessons and status in the repository instead of the conversation. Use when a decision is made, a run ends, or a session starts.
---

# Project memory

Chat is temporary. The repository is the memory.

## Where things go

| What | Where |
|---|---|
| Status, notes and doubts of a spec | The spec itself (header and notes section) |
| Architecture decisions with trade-offs | A decision record in the docs folder of the project |
| Reusable lessons from a run | A lesson record, as a lesson envelope or a short note in the project's lessons file |
| Conventions agents must follow | The project instructions file |

## Practices

- Write a decision when it is made: context, options, choice, consequence. Keep it to a few lines.
- Record a lesson only when it will change future behavior: what happened, why, what to do next time.
- Do not duplicate: link to the spec or file that holds the fact.
- Never store secrets or personal data in memory files.
- At the start of a session, read the spec and its notes before anything else.
- Delete or fix stale notes instead of piling up new ones; ask the human before removing documents.

Related skills: `context-budget`, `traceability`.
