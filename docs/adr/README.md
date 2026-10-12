# Architecture Decision Records

Decisions that change architecture, contracts, the install model or dependencies are recorded here as `NNNN-slug.md`, one decision per file, in English.

## Format

Each ADR has: **Status** (proposed, accepted, superseded by ADR-NNNN), **Context**, **Decision**, **Consequences** and **Alternatives considered**. Specs reference the ADRs they create or rely on.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-typescript-cli-zero-runtime-deps.md) | TypeScript CLI with zero runtime dependencies | proposed |
| [0002](0002-own-json-schema-subset-validator.md) | Own validator for a JSON Schema subset, with an independent oracle in tests | proposed |
| [0003](0003-generated-per-cli-targets-and-lock.md) | Generated per-CLI targets with a lock file of content hashes | proposed |
