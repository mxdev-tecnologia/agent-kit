---
format: agent-kit/v1
name: no-secrets
description: Never read, print, copy or store secrets or personal data; keep them out of logs, commits, specs and reports.
always: true
---

# No secrets

- Do not read files that hold secrets: environment files, private keys, tokens, credential files, service account files.
- Do not print, copy, log or paste secret values or personal data anywhere: chat, specs, reports, commits, pull requests, tickets or test fixtures.
- Use obviously fake values in examples and fixtures.
- If a secret appears by accident, stop, do not repeat it, tell the human, and recommend rotating it.
- Do not add secrets, private project names or internal addresses to a public repository.
- When a task needs a credential, ask the human to provide it through the project's own secret mechanism. Never ask for the value in chat.
