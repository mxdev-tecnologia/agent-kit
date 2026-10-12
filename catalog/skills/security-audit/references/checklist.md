# Security checklist

- [ ] Access checks run on the server for every protected operation.
- [ ] Defaults deny; new endpoints or commands are closed until opened on purpose.
- [ ] Input is validated for type, length and format at the boundary.
- [ ] No string-built commands, queries or paths from untrusted input.
- [ ] Paths are resolved against a root; traversal and symbolic links are refused.
- [ ] No secret in code, tests, logs, commits or documentation.
- [ ] Personal data is minimal, absent from logs, and has a retention rule.
- [ ] Error messages do not leak internals, values or stack traces to users.
- [ ] New dependencies are approved, pinned and justified.
- [ ] Data access is scoped to the tenant or owner.
- [ ] Tests cover the denied path, not only the allowed one.
