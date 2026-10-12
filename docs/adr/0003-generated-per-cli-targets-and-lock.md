# ADR-0003 — Generated per-CLI targets with a lock file of content hashes

- **Status:** proposed
- **Date:** 2026-10-12
- **Origin:** spec-03
- **Supersedes:** — (changes the "links where the OS allows" line of the Install model in `docs/ARCHITECTURE.md`)

## Context
agent-kit installs one shared brain (`AGENTS.md` and `.agents/`) and per-CLI targets (Claude Code needs `CLAUDE.md`, `.claude/skills/`, `.claude/agents/` and `.claude/commands/`). The first plan said "links where the OS allows, copies otherwise". Links behave differently on Linux, macOS and Windows (symlinks need privileges on Windows, git stores them as special entries, some tools do not follow them), and a link has no content of its own to hash. The Claude Code agent and skill formats also differ from the neutral catalog format (reduced frontmatter, `tools` instead of `capabilities`, no model field), so a plain link or copy is not enough anyway.

The installer must also detect manual edits without a database, and `update` must never destroy work done by hand.

## Decision
- Every installed file is **generated**: a copy, or a transformed copy for a CLI-specific target. The installer never creates symlinks.
- Generation is deterministic: same catalog and same inputs give byte-identical files (LF line endings, sorted keys and lists, no timestamps). Idempotence follows: a second run writes nothing.
- `agent-kit.lock.json` (`agent-kit-lock/v1`, schema `urn:agent-kit:install:lock:v1`) records the kit version, the target CLIs and a SHA-256 per installed file. Files that share a hand-written document (`AGENTS.md`, `CLAUDE.md`) hold a managed block between `<!-- agent-kit:begin -->` and `<!-- agent-kit:end -->`; the hash covers only the block content. The lock is written last, so an interrupted run converges when run again.
- `update` and `sync` overwrite or delete a file only when its current hash equals the lock. A different hash is a conflict, and conflicts are all-or-nothing: with any conflict and no `--force`, nothing is written (the lock included) and the command exits 1. A file the kit never created (not in the lock) at a destination path is a conflict that `--force` does not override. The lock is untrusted input: it is validated against its schema before any action and can only name managed paths. Text files are hashed after CRLF→LF normalization so that Windows checkouts do not look edited. `sync` stops with `version-mismatch` when the package version differs from the lock version, `check` reports it as a finding, and both suggest `update`; `update` with an older package reports `version-downgrade` unless `--force`.
- Project additions live in `.agents/local/`, are never written or deleted by the installer, and are merged into the generated targets.
- The installer writes only inside `--root`, refuses `..`, absolute paths and symlinks in the destination path, and writes atomically (temporary file, then rename).

## Consequences
- **Positive:** identical behavior on every OS; drift and manual edits are detectable with a hash; the lock is reviewable in a pull request; CLI-specific formats are possible.
- **Negative / costs:** generated files are committed duplicates of the catalog, so diffs are larger; a new kit version rewrites many files (mitigated by the conflict rules); the install code must know each CLI's format.
- **What changes in code or operation:** `src/install/` holds detection, targets, plan, apply, lock and managed blocks; `docs/ARCHITECTURE.md` (Install model, Layout) is rewritten; the lock schema joins `schemas/install/`; the package keeps zero runtime dependencies (ADR-0001).

## Alternatives considered
| Alternative | Why not |
|---|---|
| Symlinks from `.claude/` to `.agents/` | Needs privileges on Windows, not portable in git, cannot carry a CLI-specific format, no content to hash. |
| Links where possible, copies otherwise | Two behaviors to test and support; the result differs per OS. |
| Copy only, with no lock | Cannot tell a manual edit from kit drift, so `update` would either overwrite work or never update. |
| Lock with file modification times | Not stable across checkouts and CI; a content hash is. |
| Let `.agents/local/` override kit items | Hidden behavior and harder drift detection; postponed until there is a clear need. |
