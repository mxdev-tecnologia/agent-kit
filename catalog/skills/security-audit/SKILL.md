---
format: agent-kit/v1
name: security-audit
description: Checklist for reviewing authentication, input handling, secrets, personal data and dependencies. Use when a change touches security-sensitive code or data.
---

# Security audit

Use this skill for changes that touch access control, user input, secrets, personal data, networking or dependencies.

## Areas

- **Authentication and authorization.** Every protected path checks identity and permission on the server side. Defaults deny.
- **Input.** Validate type, size and format at the boundary. Encode on output. Avoid building commands, queries or paths from raw input.
- **Files and paths.** Resolve paths against a root, reject traversal, do not follow untrusted links.
- **Secrets.** None in code, logs, fixtures or history. Loaded from the environment or a secret store.
- **Personal data.** Collect the minimum, keep it out of logs and tickets, define retention.
- **Dependencies.** Add none without approval; prefer well-maintained ones; pin versions.
- **Errors and logs.** Messages help the user without leaking internals or values.
- **Multi-tenant data.** Every query is scoped to the tenant.

## Procedure

1. Identify which areas the change touches.
2. Walk the matching items of [checklist.md](references/checklist.md).
3. Report findings with severity, location and a suggested fix.
4. Stop and ask the human for anything that changes a contract or needs a new dependency.

Related skills: `verification-evidence`, `git-flow`.
