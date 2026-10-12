# Spec 99 — Example

- **Status:** rascunho
- **Nível:** lite

## Functional requirements
**Group**
- **RF-01:** THE SYSTEM SHALL do a thing.
- **RF-02:** WHEN a file is given, THE SYSTEM SHALL read it
  and print the result.
- **RF-03:** THE CI SHALL run the tests.

## Non-functional requirements
- **RNF-01 (performance):** it takes under 200 ms.

## Acceptance criteria
- **CA-01** (RF-01, RNF-01) — **Given** a file, **When** it runs, **Then** it works.
- **CA-02** (RF-02, RF-03) — **Dado** um arquivo, **Quando** roda, **Então** funciona.

## Traceability matrix
| Requirement | CA | Verification |
|---|---|---|
| RF-01 | CA-01 | test |
| RF-02 | CA-02 | test |
| RF-03 | CA-02 | test |
| RNF-01 | CA-01 | test |
