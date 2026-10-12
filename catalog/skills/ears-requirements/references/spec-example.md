# Spec 01 — Greeting command

- **Status:** rascunho
- **Nível:** lite
- **Risco:** baixo
- **Depende de:** —
- **Branch:** feature/spec-01-greeting

## Context
A small command prints a greeting so that users can check that the tool is installed. It reads one optional argument and writes one line to standard output.

## Functional requirements
- **RF-01:** WHEN the command `greet` runs without arguments, THE CLI SHALL print `Hello, world!` and exit with code 0.
- **RF-02:** WHEN the command `greet <name>` runs, THE CLI SHALL print `Hello, <name>!` and exit with code 0.
- **RF-03:** IF the name is longer than 64 characters, THEN THE CLI SHALL print a usage error and exit with code 2.

## Non-functional requirements
- **RNF-01 (performance):** the command finishes in under 100 ms on a reference machine, measured by a test with a timer.
- **RNF-02 (security):** the command writes nothing to disk and reads no environment file.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** no arguments, **When** `greet` runs, **Then** the output is `Hello, world!` and the exit code is 0. *Verification:* test `tests/greet.test.ts`
- **CA-02** (RF-02) — **Given** the name `Ana`, **When** `greet Ana` runs, **Then** the output is `Hello, Ana!` and the exit code is 0. *Verification:* test `tests/greet.test.ts`
- **CA-03** (RF-03) — **Given** a name of 65 characters, **When** `greet` runs, **Then** it prints a usage error and the exit code is 2. *Verification:* test `tests/greet.test.ts`
- **CA-04** (RNF-01) — **Given** the reference machine, **When** `greet` runs 20 times, **Then** the median time is under 100 ms. *Verification:* test `tests/greet.test.ts`
- **CA-05** (RNF-02) — **Given** a watched working directory, **When** `greet` runs, **Then** no file is created or changed. *Verification:* test `tests/greet.test.ts`

## Design
**Files (closed list):** `src/commands/greet.ts`, `tests/greet.test.ts`.

## Tasks
- [ ] Implement `greet`
- [ ] Write the tests

## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `src/commands/greet.ts` ||
| RF-02 | CA-02 | test | `src/commands/greet.ts` ||
| RF-03 | CA-03 | test | `src/commands/greet.ts` ||
| RNF-01 | CA-04 | test | `tests/greet.test.ts` ||
| RNF-02 | CA-05 | test | `tests/greet.test.ts` ||
