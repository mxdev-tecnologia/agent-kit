---
format: agent-kit/v1
name: context-budget
description: Keep the working context small by loading only what a task needs and by returning short reports. Use at the start of a session and when delegating work.
---

# Context budget

Context is a limited resource. Spend it on the task, not on background.

## Practices

- Work on one spec, or one small batch, per session. Start a fresh session after a delivery.
- Read the spec and only the sections it lists as context. Read files by range when you know the part you need.
- Search with a pointed query before opening a file. Do not read whole logs or diffs; redirect output to a file and read the summary and errors.
- Keep state in the repository (the spec, its notes), not in the conversation.
- Delegate with a precise brief: inputs, closed file list, expected output. Ask for a short report: status, files, results, blockers.
- Compact the conversation before the window gets crowded, and write down decisions first.
- Do not copy long content into reports. Link to a path instead.

## Report shape

```text
STATUS: <done | blocked>
FILES: <list>
RESULT: <one or two lines>
BLOCKER: <question and options, only if blocked>
```

Related skills: `project-memory`, `task-breakdown`.
