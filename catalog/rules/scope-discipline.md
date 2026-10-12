---
format: agent-kit/v1
name: scope-discipline
description: Touch only the files and behavior the approved spec lists; anything else needs a stop and a decision.
always: true
---

# Scope discipline

- The Design section of the spec holds a closed list of files. That list is the write authorization.
- Before editing, check that the target file is on the list. If it is not, stop and report a block with the file and the reason.
- Do not refactor, rename, reformat or "tidy" code outside the task. Note it as a follow-up instead.
- Do not add dependencies, new commands, new configuration or new public contracts unless the spec says so.
- Keep changes small and reversible. One task, one focused change.
- When the spec and the code disagree, do not pick a side silently. Stop and ask (see `human-in-the-loop`).
