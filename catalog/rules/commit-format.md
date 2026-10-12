---
format: agent-kit/v1
name: commit-format
description: Commit messages follow type(scope) description, with a fixed list of types and a lowercase scope.
always: true
---

# Commit format

Every commit subject has the form:

```text
<type>(<scope>): <description>
```

- `type` is one of: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `security`.
- `scope` uses only lowercase letters, digits and hyphens: `^[a-z0-9]+(-[a-z0-9]+)*$`.
- `description` is a short, imperative summary of the change. The project decides its language.
- Add a short body when the reason is not obvious, and a reference line such as `Refs: spec-NN` when the work follows a spec.
- One logical change per commit. Stage explicit files, never everything blindly.

Examples:

```text
feat(installer): add dry-run option
fix(validator): report the line of a bad heading
docs(readme): list the available skills
```
