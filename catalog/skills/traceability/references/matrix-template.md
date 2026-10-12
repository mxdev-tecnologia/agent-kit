# Matrix template

```text
## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `src/example.ts` | test_ca_01_example passed |
| RF-02 | CA-02, CA-03 | test + manual pendente | `src/example.ts` | |
| RNF-01 | CA-04 | command | `package.json` | `build` exit 0 |
```

Notes:

- Use one row per requirement.
- A criterion may appear in several rows when it covers several requirements.
- Leave the Evidence cell empty only for a manual check that is still pending.
