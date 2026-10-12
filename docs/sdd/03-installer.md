# Spec 03 — Installer: init, update, sync and check

- **Status:** em andamento
- **Nível:** completo
- **Risco:** alto
- **Depende de:** spec-02b
- **Épico:** agent-kit v1
- **Branch:** feature/spec-03-installer
- **Jira:** —
- **PR:** —
- **Versão:** —
- **ADR:** ADR-0003
- **Contexto:** `docs/adr/0003-generated-per-cli-targets-and-lock.md`, `docs/adr/0001-typescript-cli-zero-runtime-deps.md`, `docs/ARCHITECTURE.md`, `docs/sdd/02a-contracts-core.md`, `docs/sdd/02b-cortex-envelopes.md`, `.claude/workflow.md`

> Lifecycle (tooling Status values): rascunho → aprovada → em andamento → validada → em PR (#N) → entregue (YYYY-MM-DD) → publicada (vX.Y.Z)



## Context
This spec turns the catalog into files inside a user's project. `agent-kit init` installs the shared brain (`AGENTS.md` and `.agents/`) and the targets of each CLI (Claude Code, Codex, Antigravity); `update` brings a project to the installed kit version; `sync` regenerates the targets from the installed package and the project additions in `.agents/local/` at the same kit version; `check` reports drift without writing. `agent-kit.lock.json` records what was installed, with one SHA-256 per file, so manual edits are never overwritten silently. The lock is treated as untrusted input: it is validated before any action and can only point at managed paths.

Delivery validation escalates to spec-validator (level "completo"; risk high: the command writes into users' repositories, so path safety and no-data-loss rules are part of the contract). The design decision (generated files, no symlinks, lock with hashes, all-or-nothing conflicts) is in ADR-0003; it replaces the line "links where the OS allows, copies otherwise" in the Install model of `docs/ARCHITECTURE.md`, and this spec updates that document.

**Parallel execution (Merge order).** Specs 03, 04, 05 and 06 run in parallel from `develop`.
- `src/cli.ts` is touched by this spec and by spec-06. Each one only adds its dispatch branch and its `USAGE` line. Whichever merges second resolves the conflict by merging `develop` into its branch.
- `src/commands/check-self.ts` and `tests/cli.test.ts` are touched only by this spec.
- Docs shared in the same files: `docs/ARCHITECTURE.md` is edited by specs 03 (Install model, Layout, lock, collisions), 05 (new "Provider catalog" section) and 06 ("Rules the schemas do not encode"); `docs/INSTRUCTIONS.md` is edited by specs 03 and 06. Each spec edits only its own section; the later merge resolves any conflict by merging `develop`.
- Specs 04 and 05 touch only `catalog/`, `schemas/catalog/` and their own tests and fixtures. Their names (skills, workflows, agents, rules) must not appear in `src/catalog/collisions.ts` nor be a reserved Windows name; this spec enforces that in `check --self` after the merge.
- This spec copies `catalog/providers.json` (spec-05) when it exists; it does not depend on it.
- Hotspot note for the orchestrator: `.claude/workflow.md` may cite `collisions.json`; the file is now `src/catalog/collisions.ts`. This spec does not edit `workflow.md`; the orchestrator adjusts it.


## Functional requirements

- **RF-01:** WHEN `agent-kit init` runs without `--cli`, THE SYSTEM SHALL detect the CLIs present, by the binaries `claude`, `codex` and `agy` on `PATH` (honoring `PATHEXT` on Windows, and never executing the binary) or by the existing directories `.claude/` and `.codex/` in the target root, and by `.agents/` only when it contains something other than `.agents/local/`, and install the targets of the detected CLIs.
- **RF-02:** WHEN `--cli <list>` is given (comma-separated values among `claude`, `codex`, `antigravity`), THE SYSTEM SHALL install exactly those targets and ignore detection.
- **RF-03:** IF no CLI is detected and `--cli` is absent, or `--cli` has an unknown value, THEN THE SYSTEM SHALL print a usage error that lists the valid options and exit 2.
- **RF-04:** IF the target root already contains `agent-kit.lock.json`, THEN `agent-kit init` SHALL write nothing, suggest `agent-kit update` and exit 1.
- **RF-05:** THE SYSTEM SHALL read `catalog/` and `schemas/` from the installed package (resolved from `import.meta.url`) and never from the target project; `init` SHALL NOT ask any question.
- **RF-06:** THE SYSTEM SHALL treat `--root <dir>` as the project root in every command (default: the current directory), resolve its real path once, and IF the directory does not exist, THEN exit 2.
- **RF-07:** WHEN `init` succeeds, THE SYSTEM SHALL always create the shared files: `.agents/skills/<name>/` (`SKILL.md`, `references/` and `scripts/` copied), `.agents/agents/<name>.md`, `.agents/rules/<name>.md`, `.agents/workflows/<name>.md`, `.agents/providers.json` (from `catalog/providers.json`, only when it exists) and `.agents/schemas/` (a reference copy of the package `schemas/` for the project's agents and tools).
- **RF-08:** THE SYSTEM SHALL manage `AGENTS.md` through a block between `<!-- agent-kit:begin -->` and `<!-- agent-kit:end -->`: create the file if it does not exist, replace only the block when it exists, append the block when the markers are absent, and preserve all other content byte for byte; a file that is not valid UTF-8 is refused (path, exit 1, nothing written).
- **RF-09:** THE SYSTEM SHALL write in the `AGENTS.md` block an index of skills, workflows and agents with their paths, the body of every rule with `always: true` inline, and, for every rule with `applies-to`, its globs and its path.
- **RF-10:** IF a managed file has malformed markers (two `begin`, `end` before `begin`, `begin` without `end`, or `end` without `begin`), THEN THE SYSTEM SHALL report the path, exit 1 and write nothing; IF catalog or local content that would enter a block contains `<!-- agent-kit:begin` or `<!-- agent-kit:end`, THEN it SHALL refuse it with the path and exit 1.
- **RF-11:** WHERE the `claude` target is selected, THE SYSTEM SHALL create `CLAUDE.md` with a managed block containing `@AGENTS.md`, `.claude/skills/<name>/SKILL.md` with frontmatter reduced to `name` and `description` plus the `references/` and `scripts/` of the skill copied beside it, `.claude/agents/<name>.md` and `.claude/commands/<name>.md` for each workflow (frontmatter `description` and `argument-hint`).
- **RF-12:** WHERE the `claude` target is selected, THE SYSTEM SHALL write each agent frontmatter with `name`, `description` and `tools`, mapping capabilities as `read` → `Read, Grep, Glob`; `search` → `Grep, Glob`; `edit` → `Edit, Write`; `shell` → `Bash`; `web` → `WebFetch, WebSearch`; `mcp` adds no tool (no MCP access is granted); an agent whose only capability is `mcp` SHALL receive `Read, Grep, Glob`; THE SYSTEM SHALL NOT omit `tools` and SHALL NOT write any model field.
- **RF-13:** WHERE the `codex` target is selected, THE SYSTEM SHALL also create each workflow as `.agents/skills/<name>/SKILL.md` (frontmatter `name` and `description`), because skills and workflows share one namespace.
- **RF-14:** WHERE the `antigravity` target is selected, THE SYSTEM SHALL create nothing beyond the shared files, because that CLI reads `.agents/rules/` and `.agents/workflows/` natively.
- **RF-15:** THE SYSTEM SHALL generate every file as a regular file (copy or transformed copy) and SHALL NOT create symlinks; it SHALL keep the executable bit of files under `scripts/` where the operating system supports it, and SHALL remove directories that become empty under managed prefixes after a deletion.
- **RF-16:** THE SYSTEM SHALL read project additions from `.agents/local/{skills,agents,workflows,rules}/`, in the catalog format, validate each against the frontmatter schemas with `name` equal to the file or folder name, and include them in the generated targets and in the `AGENTS.md` index.
- **RF-17:** THE SYSTEM SHALL NOT create, change or delete any file under `.agents/local/` in `init`, `update` or `sync`, and SHALL refuse, with an error naming the path, any symlink and any secret file (`.env*`, `*.pem`, `*.key`, `id_*`, `service_account*.json`) found there.
- **RF-18:** IF a project addition has the same name as a kit item, as a native command of a selected CLI, or as a reserved Windows name, THEN THE SYSTEM SHALL report an error with the path and exit 1, and SHALL NOT override the kit item.
- **RF-19:** THE SYSTEM SHALL ship `src/catalog/collisions.ts`, a typed constant with the native command names per CLI (`claude`, `codex`, `antigravity`) listed in Design and the reserved Windows names (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`), frozen at spec approval, and SHALL check every installed or generated name against them in `init`, `update`, `sync` and `check`.
- **RF-20:** WHEN `agent-kit check --self` runs, THE SYSTEM SHALL also check every catalog name (skills, workflows, agents, rules) against the lists of all three CLIs and the reserved Windows names, and report each collision with the path of the catalog file.
- **RF-21:** THE SYSTEM SHALL derive every destination path from a validated `name` (equal to the file or folder name) and SHALL validate each path segment inside `references/` and `scripts/` (no `..`, no absolute path, no `:`, no trailing dot or space, no reserved Windows name), reporting the path and exiting 1 on failure.
- **RF-22:** WHEN a command writes files, THE SYSTEM SHALL write `agent-kit.lock.json` at the root as `{ "format": "agent-kit-lock/v1", "version": "<kit semver>", "clis": [...], "files": { "<relative path with />": "sha256-<hex>" } }`, with sorted keys, two-space indentation and a final newline.
- **RF-23:** THE SYSTEM SHALL compute the hash of a managed-block file (`AGENTS.md`, `CLAUDE.md`) over the block content only, and the hash of every other file over its bytes; for text files (no NUL byte) it SHALL normalize CRLF to LF before hashing and before comparing desired and disk content, and SHALL ignore the file mode.
- **RF-24:** THE SYSTEM SHALL provide `schemas/install/lock.schema.json` (`$id` `urn:agent-kit:install:lock:v1`) that validates the lock, with `files` keys restricted by a pattern, whose quantifier bounds the length (the subset has no `propertyNames`), to the managed prefixes (`.agents/skills/`, `.agents/agents/`, `.agents/rules/`, `.agents/workflows/`, `.agents/schemas/`, `.agents/providers.json`, `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, `AGENTS.md`, `CLAUDE.md`), with fixtures in the conformance harness of spec-02a.
- **RF-25:** WHEN `update`, `sync` or `check` runs, THE SYSTEM SHALL validate the lock against its schema before any other action; IF the lock is missing or invalid, THEN THE SYSTEM SHALL exit 1 and write nothing; THE SYSTEM SHALL write or delete only paths under the managed prefixes, never under `.agents/local/` or `.git/`.
- **RF-26:** WHEN `agent-kit update` runs, THE SYSTEM SHALL regenerate every managed file from the installed package, write the new lock last, and report the plan as `create`, `update`, `delete`, `unchanged` and `conflict` lines; IF the package version is older than the lock version, THEN it SHALL report `version-downgrade`, write nothing and exit 1, unless `--force` is given.
- **RF-27:** IF the current hash of a managed file in the lock differs from the lock (edited by hand), THEN `update` and `sync` SHALL list a conflict, write nothing at all (lock included) and exit 1, unless `--force` is given, in which case THE SYSTEM SHALL overwrite the edited managed files.
- **RF-28:** IF a desired path exists on disk, is absent from the lock and has content different from the desired one, THEN every command that writes SHALL report an unmanaged-file conflict that `--force` does NOT override; IF its content equals the desired content, THEN THE SYSTEM SHALL adopt it into the lock without rewriting it. For `AGENTS.md` and `CLAUDE.md` the comparison is on the managed block: an absent block is a `create` (the block is appended, RF-08); a block present, outside the lock and equal to the desired one is adopted; a block present, outside the lock and different is a conflict that `--force` does not override.
- **RF-29:** WHEN a file listed in the lock no longer exists in the new kit version, THE SYSTEM SHALL delete it only if its current hash equals the lock; otherwise it SHALL report a conflict, and with `--force` it SHALL drop the entry from the lock and leave the file on disk.
- **RF-30:** WHEN `agent-kit sync [--force]` runs, THE SYSTEM SHALL regenerate the targets of the CLIs in the lock from the installed package and `.agents/local/` with the conflict rules of `update`; IF the package version differs from the lock version, THEN `sync` SHALL report `version-mismatch`, suggest `update`, write nothing and exit 1.
- **RF-31:** WHEN `agent-kit check` runs without `--self`, THE SYSTEM SHALL write nothing and report, against the lock: missing files, files edited by hand, managed orphans, name collisions, invalid frontmatter in `.agents/local/`, a `version-mismatch` when the package version differs from the lock version (suggesting `update`), and an invalid or missing lock; it SHALL exit 0 when there is no finding and 1 otherwise.
- **RF-32:** WHEN `--dry-run` is given to `init`, `update` or `sync`, THE SYSTEM SHALL print the plan and SHALL NOT change the disk, including the lock.
- **RF-33:** THE SYSTEM SHALL never write or delete outside the root: it SHALL resolve the real path of the root once, then normalize every destination, refuse `..` segments, absolute paths and any symlink found below the root along the destination path, and report the offending path with exit 1; a root reached through a symlinked path SHALL work.
- **RF-34:** THE SYSTEM SHALL write each file atomically (temporary file in the same directory, then rename); IF the rename fails with `EPERM` or `EBUSY`, THEN it SHALL retry up to 5 times within about 1 s, and then report the path, exit 1 and leave no temporary file.
- **RF-35:** THE SYSTEM SHALL write the lock last and atomically, and the plan SHALL classify a file whose content already equals the desired content as `unchanged` before evaluating conflicts, so that a run aborted midway converges when run again.
- **RF-36:** WHEN `sync`, or `update` at the same kit version, runs and nothing changed, THE SYSTEM SHALL perform zero writes, including the lock, and leave every modification time unchanged.
- **RF-37:** THE SYSTEM SHALL update `docs/ARCHITECTURE.md` (Install model, Layout, lock and collision list), `docs/INSTRUCTIONS.md` (the four commands and their options) and the `README.md` overview, replacing the "links where the OS allows" text, and SHALL document that MCP access for agents is roadmap.

## Non-functional requirements
- **RNF-01 (performance):** `init` of a catalog with 60 files into an empty temporary directory takes under 2 s (median of 5 runs, CI `ubuntu-latest` Node 22; limit ×4 when `process.platform === "win32"`).
- **RNF-02 (reliability / idempotence):** a `sync` with no change performs 0 writes (lock included) and leaves every modification time unchanged, measured by a write counter in the apply layer and a snapshot with mtime.
- **RNF-03 (security / path containment):** with malicious destinations (`../x`, absolute path, symlinked directory, symlinked file), a lock with keys outside the managed prefixes, a symlink in `.agents/local/` pointing at a key, and a secret file in `.agents/local/`, the tests record 0 writes, 0 deletes and 0 copies of secret content, and the command exits 1 with the path in the message.
- **RNF-04 (reliability / atomicity):** a failure injected before the rename leaves the previous file intact and no temporary file in the tree; an abort after N files followed by a new run converges with no conflicts.
- **RNF-05 (compatibility / line endings):** generated content and lock hashes are identical when source files use LF or CRLF; a tree checked out with CRLF (as `core.autocrlf` does) yields `check` exit 0 and `sync` with 0 writes; the lock paths always use `/`.
- **RNF-06 (usability):** every error message that concerns a file includes its relative path; a usage error lists the valid options.
- **RNF-07 (supply chain):** zero runtime dependencies (ADR-0001); the package policy test still passes.
- **RNF-08 (data protection):** the command reads and writes only the paths in its plan and never reads `.env` files, keys or tokens; the lock and the output contain paths and hashes only. LGPD and cost: none, because nothing is sent over the network.
- **RNF-09 (compatibility / size):** the managed block of `AGENTS.md` is at most 24 KiB (below the 32 KiB default limit of Codex for project documents); IF it would be larger, the command exits 1 with the size and writes nothing.
- Authorization / isolation: none beyond RNF-03; this is a local CLI with no endpoint, and it runs with the permissions of the calling user.

## Acceptance criteria
- **CA-01** (RF-01) — **Given** a temp project with a `.codex/` directory and a fake `agy` on `PATH` (and, separately, a fake `claude.cmd` with `PATHEXT` set), **When** `init` runs without `--cli`, **Then** the Codex and Antigravity targets are installed (and the Claude targets for the `.cmd` case), no binary is executed, and a project with only `.agents/local/` does not select Antigravity. *Verification:* test `tests/install/detect.test.ts`
- **CA-02** (RF-02, RF-05) — **Given** a project where `claude` is detected, **When** `init --cli codex` runs, **Then** only the shared files and the Codex targets are created, and no question is asked. *Verification:* test `tests/install/init.test.ts`
- **CA-03** (RF-03) — **Given** an empty project and an empty `PATH`, **When** `init` runs, **And** when `init --cli foo` runs, **Then** each exits 2, stderr lists `claude`, `codex` and `antigravity`, and nothing is written. *Verification:* test `tests/install/init.test.ts`
- **CA-04** (RF-04) — **Given** a project with `agent-kit.lock.json`, **When** `init` runs, **Then** it exits 1, suggests `update` and leaves every file unchanged. *Verification:* test `tests/install/init.test.ts`
- **CA-05** (RF-05, RF-06) — **Given** a project that contains its own `catalog/` and `schemas/` folders with different content, **When** `init --root <dir>` runs, **Then** the installed files come from the package and the project folders are untouched. *Verification:* test `tests/install/init.test.ts`
- **CA-06** (RF-06, RF-33) — **Given** a `--root` that does not exist, **When** any command runs, **Then** it exits 2 with a message that names the path; **And** a root reached through a symlinked path works and writes inside the real directory. *Verification:* test `tests/install/init.test.ts`
- **CA-07** (RF-07) — **Given** a fixture catalog, **When** `init --cli antigravity` runs, **Then** the shared files exist: skills with `references/` and `scripts/`, agents, rules, workflows, `.agents/providers.json` and `.agents/schemas/`; **And** without `catalog/providers.json` no `providers.json` is created. *Verification:* test `tests/install/targets.test.ts`
- **CA-08** (RF-08) — **Given** an `AGENTS.md` with hand-written text, **When** `init` runs, **Then** the block is appended and the original text is byte-identical; **And** given a file with markers, only the block changes; **And** with no `AGENTS.md`, the file is created with the block; **And** an `AGENTS.md` that is not valid UTF-8 is refused with its path, exit 1 and no write. *Verification:* test `tests/install/managed-block.test.ts`
- **CA-09** (RF-09) — **Given** rules with `always: true` and with `applies-to`, **When** the block is generated, **Then** it lists skills, workflows and agents with paths, includes the body of the always rule inline, and lists the globs and the path of the scoped rule without its body. *Verification:* test `tests/install/targets.test.ts`
- **CA-10** (RF-10) — **Given** an `AGENTS.md` with two `begin` markers, one with `end` before `begin`, one with `begin` and no `end`, and one with `end` and no `begin`, **When** `init`, `update` or `sync` runs, **Then** each case exits 1 with the file path and the tree is unchanged; **And** a rule body (kit or local) that contains `<!-- agent-kit:begin` or `<!-- agent-kit:end` is refused with its path and exit 1. *Verification:* test `tests/install/managed-block.test.ts`
- **CA-11** (RF-11) — **Given** `--cli claude`, **When** `init` runs, **Then** `CLAUDE.md` has a block with `@AGENTS.md`, each `.claude/skills/<name>/SKILL.md` has only `name` and `description`, its `references/` and `scripts/` are copied beside it, and each workflow has a `.claude/commands/<name>.md` with `description` and `argument-hint`. *Verification:* test `tests/install/targets.test.ts`
- **CA-12** (RF-12) — **Given** agents with capabilities `read`, `search`, `edit`, `shell`, `web`, `mcp` alone and in combinations, **When** the Claude agents are generated, **Then** `tools` equals the mapping of RF-12 (deduplicated, in a fixed order), every agent has a `tools` line, `read,search,mcp` has no `Edit`, `Write` or `Bash`, an agent with only `mcp` gets `Read, Grep, Glob`, and no file has a model field. *Verification:* test `tests/install/targets.test.ts`
- **CA-13** (RF-13, RF-14) — **Given** a fixture catalog with one workflow, **When** `init --cli codex` runs, **Then** `.agents/skills/<workflow>/SKILL.md` exists; **And** with `--cli antigravity` only, it does not exist and no CLI-specific folder is created. *Verification:* test `tests/install/targets.test.ts`
- **CA-14** (RF-15) — **Given** an installed project with the three CLIs, **When** the test walks the tree, **Then** every installed entry is a regular file or directory and none is a symlink; **And** a file under `scripts/` keeps its executable bit on POSIX while the lock hash is the same with or without the bit; **And** after a deletion that empties a managed directory, the directory is removed and `.agents/local/` is never removed. *Verification:* test `tests/install/init.test.ts`
- **CA-15** (RF-16, RF-17) — **Given** `.agents/local/skills/my-skill/SKILL.md` and `.agents/local/rules/team.md`, **When** `init`, `update` and `sync` run, **Then** the additions appear in the generated targets and in the `AGENTS.md` index, the files under `.agents/local/` keep their bytes and modification time, and an invalid frontmatter or a `name` different from the folder name is reported with the path. *Verification:* test `tests/install/local.test.ts`
- **CA-16** (RF-17) — **Given** a local skill with `references/key` as a symlink to a file outside the root, and a local file `.env.local` and `id_rsa`, **When** `sync` runs, **Then** each is refused with its path, exit 1, and no copy of their content exists in the tree. *Verification:* test `tests/install/local.test.ts`
- **CA-17** (RF-18) — **Given** a local skill named like a kit item, another named like a native command (`review`), and another named `nul`, **When** `sync` runs, **Then** each is reported with its path, nothing is written and the exit code is 1. *Verification:* test `tests/install/local.test.ts`
- **CA-18** (RF-19) — **Given** `src/catalog/collisions.ts`, **When** the test loads it, **Then** it has the three CLI keys with at least the names listed in Design, no duplicates, and the reserved Windows names; **And** a catalog name equal to an entry makes `init` exit 1 with the name and the path. *Verification:* test `tests/install/collisions.test.ts`
- **CA-19** (RF-20) — **Given** a repository whose catalog has a skill named `status`, and another with an agent named `con`, **When** `check --self` runs, **Then** it fails with the catalog path and the reason; **And** the real catalog passes. *Verification:* test `tests/check-self.test.ts`
- **CA-20** (RF-21) — **Given** a local item whose `references/` has `../x`, an absolute path, `a:b`, `trail.` and `nul.md`, **When** `sync` runs, **Then** each is refused with its path and nothing is written; **And** a destination is always built from the validated `name`. *Verification:* test `tests/install/apply.test.ts`
- **CA-21** (RF-22, RF-23) — **Given** a finished `init`, **When** the lock is read, **Then** it has `format`, `version` (equal to the package version), `clis` and `files` with sorted keys, `/` separators, a final newline, and for `AGENTS.md` and `CLAUDE.md` the hash of the block only. *Verification:* test `tests/install/lock.test.ts`
- **CA-22** (RF-23, RNF-05) — **Given** the same files with LF and with CRLF line endings, **When** hashed and compared, **Then** the hashes are equal for text files, a file with a NUL byte is hashed over raw bytes, and a changed file mode does not change the hash. *Verification:* test `tests/install/lock.test.ts`
- **CA-23** (RF-24) — **Given** `schemas/install/lock.schema.json`, **When** the harness runs, **Then** it is registered as `urn:agent-kit:install:lock:v1`, valid fixtures pass, and invalid ones fail (missing `format`, wrong `format`, hash without the `sha256-` prefix, extra property, path with `\`, unknown CLI, a key such as `package.json`, `.agents/local/x.md`, `.git/config` or `../x`), each declared in `cases.json`. *Verification:* test `tests/schemas-conformance.test.ts` (fixtures `tests/fixtures/schemas/install-lock/`)
- **CA-24** (RF-25) — **Given** a missing lock, an invalid JSON lock and a lock with a key outside the managed prefixes, **When** `update`, `sync` and `check` run, **Then** each exits 1 with the lock path and no file is written or deleted. *Verification:* test `tests/install/lock.test.ts`
- **CA-25** (RF-26, RF-35) — **Given** a project installed with an older fixture version, **When** `update` runs, **Then** changed files are updated, new files created, the lock holds the new version and hashes, the lock is written after all other files, and the output has one line per action; **And** with a package older than the lock, `update` reports `version-downgrade`, writes nothing and exits 1, and with `--force` it proceeds. *Verification:* test `tests/install/update.test.ts`
- **CA-26** (RF-27, RF-30) — **Given** two managed files, one edited by hand and one with a pending update, **When** `update` or `sync` runs without `--force`, **Then** the conflict is listed, the exit code is 1 and a snapshot of the whole tree, lock included, is unchanged; **And** with `--force` the edited file is overwritten and the exit code is 0. *Verification:* test `tests/install/update.test.ts`
- **CA-27** (RF-28) — **Given** a user file at a desired path that is not in the lock, **When** `init`, `update` or `sync` runs, **Then** it is an unmanaged-file conflict, `--force` does not override it and the tree is unchanged; **And** when the content equals the desired content, the file is adopted into the lock without a rewrite; **And** a hand-written `AGENTS.md` without a block makes `init` exit 0 and append the block, preserving the text; **And** a block outside the lock with different content is a conflict that `--force` does not override. *Verification:* test `tests/install/update.test.ts`
- **CA-28** (RF-29) — **Given** a file that the new version removed, **When** its hash equals the lock, **Then** `update` deletes it; **And** when it was edited, `update` reports a conflict and keeps it, and with `--force` it only drops the lock entry and leaves the file. *Verification:* test `tests/install/update.test.ts`
- **CA-29** (RF-30) — **Given** an installed project and a new local agent, **When** `sync` runs, **Then** the Claude agent file for it is created, the lock `version` is unchanged and the kit files are not rewritten; **And** with a package version different from the lock version, `sync` reports `version-mismatch`, suggests `update`, writes nothing and exits 1. *Verification:* test `tests/install/sync.test.ts`
- **CA-30** (RF-31) — **Given** a project with a deleted file, an edited file, a managed orphan, a colliding local name, an invalid local frontmatter and, separately, an invalid lock and a lock with another version, **When** `check` runs, **Then** each finding (including `version-mismatch`) is listed with its path, the disk is unchanged and the exit code is 1; **And** a clean project exits 0. *Verification:* test `tests/install/check.test.ts`
- **CA-31** (RF-32) — **Given** a project, **When** `init --dry-run`, `update --dry-run` and `sync --dry-run` run, **Then** the output has `create`/`update`/`delete`/`unchanged`/`conflict` lines and a snapshot of the tree (paths, bytes and mtime) before and after is equal. *Verification:* test `tests/install/dry-run.test.ts`
- **CA-32** (RF-33) — **Given** a plan with a destination `../escape.md`, an absolute destination, a destination below a symlinked directory and a symlinked file, **When** apply runs, **Then** each is refused with its path, exit 1, and no file exists outside the root. *Verification:* test `tests/install/apply.test.ts`
- **CA-33** (RF-34) — **Given** a failure injected between the temporary write and the rename, **When** apply runs over an existing file, **Then** the old content is intact and no temporary file remains; **And** a rename that fails with `EPERM` 4 times then succeeds is retried, while one that always fails ends in an error with the path, exit 1 and no temporary file. *Verification:* test `tests/install/apply.test.ts`
- **CA-34** (RF-35) — **Given** an `update` aborted (simulated) after N files and before the lock, **When** the command runs again, **Then** it reports no conflict, converges to the full desired state and writes the lock last. *Verification:* test `tests/install/update.test.ts`
- **CA-35** (RF-36) — **Given** a finished `init`, **When** `sync` and `update` (same version) run again, **Then** the write counter is 0 (lock included) and a tree snapshot with mtime is equal. *Verification:* test `tests/install/sync.test.ts`
- **CA-36** (RF-37) — **Given** `docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md` and `README.md`, **When** reviewed, **Then** the Install model describes generated files, the lock and the collision list, the "links" text is gone, the four commands are documented with their options, and MCP access is stated as roadmap. *Verification:* manual (read the files against the RF)
- **CA-37** (RNF-01) — **Given** a fixture catalog with 60 files, **When** `init` runs on an empty directory 5 times, **Then** the median wall time is under 2 s (×4 on `win32`). *Verification:* test `tests/install/perf.test.ts`
- **CA-38** (RNF-05) — **Given** the same fixture catalog in LF and in CRLF, **When** `init` runs on each, **Then** generated files and lock hashes are identical; **And** a tree converted to CRLF makes `check` exit 0 and `sync` write nothing. *Verification:* test `tests/install/lock.test.ts`
- **CA-39** (RNF-06) — **Given** the failure cases above, **When** messages are inspected, **Then** each file-related message contains the relative path. *Verification:* test `tests/install/messages.test.ts`
- **CA-40** (RNF-07) — **Given** `package.json`, **When** the policy test runs, **Then** there are no runtime `dependencies`. *Verification:* test `tests/package-policy.test.ts`
- **CA-41** (RNF-08) — **Given** a project containing `.env` and `service_account.json`, **When** `init`, `sync` and `check` run with the file-access calls observed, **Then** neither file is opened. *Verification:* test `tests/install/apply.test.ts`
- **CA-42** (RNF-09) — **Given** rules whose inline bodies make the `AGENTS.md` block 24 KiB, and others making it larger, **When** `init` runs, **Then** the first succeeds and the second exits 1 with the block size and writes nothing. *Verification:* test `tests/install/targets.test.ts`
- **CA-43** (RF-07, RF-11, RF-13, RF-36) — **Given** a built `dist/`, **When** the smoke test installs the kit in a temporary project with `--cli claude,codex,antigravity`, **Then** it finds the expected files for each CLI, `check` exits 0, and a second `sync` writes nothing. *Verification:* test `tests/smoke/install.smoke.test.ts` (`pnpm test:smoke`)
- **CA-44** (RF-31) — **Given** `tests/cli.test.ts`, **When** it runs, **Then** `check` without `--self` is no longer a usage error for the existing cases, `check --self` behaves as before, and `init`, `update`, `sync` and `check` appear in the usage. *Verification:* test `tests/cli.test.ts`

## Design
**Files (closed list — this is the write authorization):**
- `src/install/detect.ts` (CLI detection), `src/install/targets.ts` (path map and per-CLI transforms), `src/install/plan.ts` (desired state versus disk and lock, with conflicts), `src/install/apply.ts` (safe, atomic writes and deletes, dry-run), `src/install/lock.ts` (read, validate, write, hash), `src/install/managed-block.ts` (marker handling)
- `src/commands/init.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts`
- `src/catalog/collisions.ts`
- `src/cli.ts` (dispatch of the four commands, `USAGE`, options `--cli`, `--dry-run`, `--force`; spec-06 adds its own branch)
- `src/commands/check-self.ts` (collision check of RF-20; imports the constant)
- `schemas/install/lock.schema.json`
- `tests/install/*.test.ts` (`detect`, `init`, `targets`, `managed-block`, `local`, `collisions`, `lock`, `update`, `sync`, `check`, `dry-run`, `apply`, `perf`, `messages`)
- `tests/cli.test.ts` (the case `check` without `--self` changes), `tests/check-self.test.ts` (collision case), `tests/smoke/install.smoke.test.ts`
- `tests/fixtures/install/` (fixture catalogs and projects), `tests/fixtures/schemas/install-lock/{valid,invalid}/*.json` + `cases.json`
- Docs: `docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md`, `README.md`, `docs/adr/0003-generated-per-cli-targets-and-lock.md` (status stays `proposed` until the spec is approved)
- No change to `package.json` dependencies. The Design passes 8 files; one spec is acceptable because the parts are cohesive. Keep each module small and with one responsibility.

**How the collision list is loaded.** `src/catalog/collisions.ts` is a typed TypeScript constant (`COLLISIONS` per CLI and `RESERVED_NAMES`), imported by the commands and by `check-self.ts`. It is compiled by `tsc` into `dist/`, so no JSON import, `resolveJsonModule` or file copy is needed and `tsconfig.json` is not touched. Hotspot: `.claude/workflow.md` may mention `collisions.json`; the orchestrator adjusts it.

**Command line** (`--root` is always the project root; `--schemas` belongs to `validate`, spec-06):
- `init [--cli claude,codex,antigravity] [--root <dir>] [--dry-run]`; `update [--force] [--dry-run] [--root <dir>]`; `sync [--force] [--dry-run] [--root <dir>]`; `check [--root <dir>]` (and `check --self`, which stays as is plus RF-20).
- `init` never asks a question; it prints the detected list and continues. There is no `--yes`.
- Exit codes: 0 ok, 1 failure or conflict, 2 usage error (including a non-existent `--root`).

**Target map:**

| Scope | Destination | Content |
|---|---|---|
| Shared (always) | `.agents/skills/<name>/` | `SKILL.md`, `references/`, `scripts/` copied |
| Shared | `.agents/agents/<name>.md`, `.agents/rules/<name>.md`, `.agents/workflows/<name>.md` | copies |
| Shared | `.agents/providers.json` | copy of `catalog/providers.json`, if it exists |
| Shared | `.agents/schemas/` | reference copy of `schemas/` for the project's agents and tools (the validators use the package, or `--schemas`) |
| Shared | `AGENTS.md` | managed block (index, always-rules inline, scoped rules listed), at most 24 KiB |
| Claude Code | `CLAUDE.md` | managed block with `@AGENTS.md` |
| Claude Code | `.claude/skills/<name>/` | `SKILL.md` with frontmatter `name`, `description`; `references/` and `scripts/` copied |
| Claude Code | `.claude/agents/<name>.md` | frontmatter `name`, `description`, `tools` (RF-12) |
| Claude Code | `.claude/commands/<name>.md` | frontmatter `description`, `argument-hint`; body of the workflow |
| Codex | `.agents/skills/<workflow>/SKILL.md` | workflow as a skill |
| Antigravity | nothing extra | reads `.agents/rules/` and `.agents/workflows/` |

**Collision list (`src/catalog/collisions.ts`; frozen at approval, the implementation does not add or remove names):**
- `claude`: add-dir, agents, bug, clear, compact, config, context, cost, doctor, export, help, hooks, ide, init, install-github-app, login, logout, mcp, memory, model, output-style, permissions, plugin, pr-comments, privacy-settings, release-notes, resume, review, rewind, security-review, status, statusline, terminal-setup, todos, upgrade, usage, vim
- `codex`: approvals, compact, diff, exit, init, logout, mcp, mention, model, new, prompts, quit, review, status, undo
- `antigravity`: help, init, memory, review, status, start, remember
- reserved Windows names (forbidden for every item, kit or local): con, prn, aux, nul, com1–com9, lpt1–lpt9

**Lock (`agent-kit-lock/v1`):** keys `format` (const), `version` (semver string), `clis` (unique, enum `claude`, `codex`, `antigravity`), `files` (object; key = relative path with `/`, pattern restricted to the managed prefixes, with the size limit in the pattern quantifier (for example `{1,250}`) because the subset has no `propertyNames`, no `..`; value pattern `^sha256-[0-9a-f]{64}$`; `maxProperties` 2000). The schema uses only the keyword subset of spec-02a (`patternProperties` plus `additionalProperties: false`, every string with `maxLength`). The lock does not list itself. It is untrusted input: validated before use (RF-25).

**Plan and conflicts.** Desired state = kit catalog + `.agents/local/` rendered per selected CLI. Order of evaluation for each desired path: (1) content on disk equals the desired content (after CRLF→LF for text) → `unchanged` (adopted into the lock if the entry is missing or different); (2) absent on disk → `create`; (3) in the lock and disk hash equals the lock → `update`; (4) in the lock and disk hash differs → `conflict` (`--force` overrides); (5) not in the lock and different content → unmanaged-file `conflict` (`--force` does not override); for `AGENTS.md` and `CLAUDE.md` the comparison is on the block: absent block → `create` (append), block outside the lock equal to the desired one → adopted, different → conflict. For lock entries not desired: absent on disk → entry dropped; hash equals the lock → `delete` (then empty managed directories are removed); otherwise `conflict` (`--force` drops the entry and leaves the file). If the plan has any conflict that is not overridden, nothing is written, lock included. Apply order: files first, lock last (atomic). The same plan feeds `--dry-run`, `apply` and `check`. `sync` and `check` render from the installed package; when its version differs from the lock they stop with `version-mismatch` (RF-30, RF-31).

**Decisions (owner and orchestrator, cycle 1):**
- A. Conflicts are all-or-nothing: any conflict without `--force` writes nothing, lock included, and exits 1 (ADR-0003 aligned).
- B. `sync` and `check` with a package version different from the lock version report `version-mismatch`, exit 1 and suggest `update`; missing, edited and orphan findings are computed against the lock.
- C. A Claude agent with `mcp` keeps the `tools` mapped from its other capabilities and gets no MCP access (least privilege); `tools` is never omitted, and an agent with only `mcp` gets `Read, Grep, Glob`. MCP access for agents is roadmap.
- D. `references/` and `scripts/` of skills are copied into `.claude/skills/<name>/` as well.
- `--root` is the project root in every command; the validators (spec-06) use `--schemas <dir>`. `.agents/schemas/` is only a reference copy for project agents and tools.
- The collision list is frozen at approval and includes the reserved Windows names.
- `init` never asks anything and has no `--yes`; `sync` has `--force` with the semantics of `update`.
- Decisions made by the writer (confirm at approval): local items are rendered to the same shared and CLI targets as kit items, and those generated copies are recorded in the lock while the sources are never touched; `--force` never deletes an edited file that the kit removed (it drops the lock entry and leaves the file); an agent with only `mcp` receives the read tools; the `AGENTS.md` block over 24 KiB is an error, not a truncation; the rename retry is 5 attempts within about 1 s.

## Tasks
- [x] `schemas/install/lock.schema.json` with fixtures in the conformance harness
- [x] `src/catalog/collisions.ts` and the collision check (install commands and `check --self`)
- [x] `src/install/lock.ts` and `src/install/managed-block.ts` with tests
- [x] `src/install/detect.ts` and `src/install/targets.ts` with tests
- [x] `src/install/plan.ts` and `src/install/apply.ts` (conflicts, safety, atomicity, dry-run) with tests
- [x] Commands `init`, `update`, `sync`, `check`, `src/cli.ts` dispatch and `tests/cli.test.ts`
- [x] `tests/smoke/install.smoke.test.ts`
- [x] Docs updated (`docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md`, `README.md`)

## Aceite
```bash
corepack enable && pnpm install --frozen-lockfile   # exit 0
pnpm --silent lint                                  # exit 0
pnpm --silent typecheck                             # exit 0
pnpm --silent test                                  # all pass, including tests/install and conformance
pnpm --silent build                                 # exit 0
node dist/cli.js check --self                       # exit 0, collisions checked
pnpm --silent test:smoke                            # installs with the three CLIs in a temp project, exit 0
```

## Changelog
- **Adicionado:** comandos `agent-kit init`, `update`, `sync` e `check` para instalar o kit em um projeto (Claude Code, Codex e Antigravity), com `agent-kit.lock.json`, adições do projeto em `.agents/local/` e checagem de colisão de nomes.
- **Alterado:** o modelo de instalação passa a gerar arquivos (sem links simbólicos).
- **Atenção no deploy:** nenhuma

## Out of scope
- Publishing on npm (spec-07).
- Overriding kit items from `.agents/local/`.
- MCP configuration and MCP access for agents (roadmap).
- macOS-specific behavior.
- Merging `.agents/local/providers.json` over `.agents/providers.json` (roadmap).


## Traceability matrix
| Requirement | CA | Verification | Files | Evidence |
|---|---|---|---|---|
| RF-01 | CA-01 | test | `src/commands/init.ts`, `src/install/detect.ts`, `src/cli.ts` | detect.test: test_ca_01_* |
| RF-02 | CA-02 | test | `src/commands/init.ts`, `src/install/detect.ts`, `src/cli.ts` | init.test: test_ca_02_* |
| RF-03 | CA-03 | test | `src/commands/init.ts`, `src/install/detect.ts`, `src/cli.ts` | init.test: test_ca_03_* |
| RF-04 | CA-04 | test | `src/commands/init.ts`, `src/install/detect.ts`, `src/cli.ts` | init.test: test_ca_04_* |
| RF-05 | CA-02, CA-05 | test | `src/commands/init.ts`, `src/install/detect.ts`, `src/cli.ts` | init.test: test_ca_02_*, test_ca_05_* |
| RF-06 | CA-05, CA-06 | test | `src/commands/init.ts`, `src/install/detect.ts`, `src/cli.ts` | init.test: test_ca_05_*, test_ca_06_* |
| RF-07 | CA-07, CA-43 | test | `src/install/targets.ts` | targets.test: test_ca_07_*; smoke test_ca_43_* |
| RF-08 | CA-08 | test | `src/install/managed-block.ts` | managed-block.test: test_ca_08_* |
| RF-09 | CA-09 | test | `src/install/managed-block.ts` | targets.test: test_ca_09_* |
| RF-10 | CA-10 | test | `src/install/managed-block.ts` | managed-block.test: test_ca_10_* |
| RF-11 | CA-11, CA-43 | test | `src/install/targets.ts` | targets.test: test_ca_11_*; smoke |
| RF-12 | CA-12 | test | `src/install/targets.ts` | targets.test: test_ca_12_* |
| RF-13 | CA-13, CA-43 | test | `src/install/targets.ts` | targets.test: test_ca_13_*; smoke |
| RF-14 | CA-13 | test | `src/install/targets.ts` | targets.test: test_ca_13_* |
| RF-15 | CA-14 | test | `src/install/targets.ts` | init.test: test_ca_14_* (3) |
| RF-16 | CA-15 | test | `src/install/plan.ts` | local.test: test_ca_15_* |
| RF-17 | CA-15, CA-16 | test | `src/install/plan.ts` | local.test: test_ca_15_*, test_ca_16_* |
| RF-18 | CA-17 | test | `src/install/plan.ts` | local.test: test_ca_17_* |
| RF-19 | CA-18 | test | `src/catalog/collisions.ts`, `src/commands/check-self.ts`, `src/install/plan.ts` | collisions.test: test_ca_18_* |
| RF-20 | CA-19 | test | `src/catalog/collisions.ts`, `src/commands/check-self.ts`, `src/install/plan.ts` | check-self.test: test_ca_19_* |
| RF-21 | CA-20 | test | `src/catalog/collisions.ts`, `src/commands/check-self.ts`, `src/install/plan.ts` | apply.test: test_ca_20_* |
| RF-22 | CA-21 | test | `src/install/lock.ts`, `schemas/install/lock.schema.json` | lock.test: test_ca_21_* |
| RF-23 | CA-21, CA-22 | test | `src/install/lock.ts`, `schemas/install/lock.schema.json` | lock.test: test_ca_21_*, test_ca_22_* |
| RF-24 | CA-23 | test | `src/install/lock.ts`, `schemas/install/lock.schema.json` | schemas-conformance (auto-discovers fixtures/schemas/install-lock) |
| RF-25 | CA-24 | test | `src/install/lock.ts`, `schemas/install/lock.schema.json` | lock.test: test_ca_24_lock_% |
| RF-26 | CA-25 | test | `src/install/plan.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts` | update.test: test_ca_25_* |
| RF-27 | CA-26 | test | `src/install/plan.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts` | update.test: test_ca_26_* |
| RF-28 | CA-27 | test | `src/install/plan.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts` | update.test: test_ca_27_* (3) |
| RF-29 | CA-28 | test | `src/install/plan.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts` | update.test: test_ca_28_* |
| RF-30 | CA-26, CA-29 | test | `src/install/plan.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts` | update.test: test_ca_26_*; sync.test: test_ca_29_* |
| RF-31 | CA-30, CA-44 | test | `src/install/plan.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts` | check.test: test_ca_30_* (3); cli.test: test_ca_44_* |
| RF-32 | CA-31 | test | `src/install/plan.ts`, `src/commands/update.ts`, `src/commands/sync.ts`, `src/commands/check.ts` | dry-run.test: test_ca_31_* |
| RF-33 | CA-06, CA-32 | test | `src/install/apply.ts` | init.test: test_ca_06_*; apply.test: test_ca_32_* |
| RF-34 | CA-33 | test | `src/install/apply.ts` | apply.test: test_ca_33_* (2) |
| RF-35 | CA-25, CA-34 | test | `src/install/apply.ts` | update.test: test_ca_25_*, test_ca_34_* |
| RF-36 | CA-35, CA-43 | test | `src/install/apply.ts` | sync.test: test_ca_35_*; smoke |
| RF-37 | CA-36 | manual | `docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md`, `README.md` | manual pendente (CA-36): docs conferidos, sem "links where the OS allows" |
| RNF-01 | CA-37 | test | `tests/install/perf.test.ts` | perf.test: test_ca_37_* |
| RNF-02 | CA-35 | test | `src/install/apply.ts`, `tests/install/sync.test.ts` | sync.test: test_ca_35_* |
| RNF-03 | CA-16, CA-24, CA-32 | test | `src/install/apply.ts`, `src/install/lock.ts`, `tests/install/local.test.ts` | lock.test test_ca_24_lock_%; local.test test_ca_16_*; apply.test test_ca_32_* |
| RNF-04 | CA-33, CA-34 | test | `src/install/apply.ts`, `tests/install/apply.test.ts` | apply.test: test_ca_33_*; update.test: test_ca_34_* |
| RNF-05 | CA-22, CA-38 | test | `src/install/lock.ts`, `tests/install/lock.test.ts` | lock.test: test_ca_22_*, test_ca_38_* (2) |
| RNF-06 | CA-39 | test | `src/install/*.ts`, `tests/install/messages.test.ts` | messages.test: test_ca_39_* |
| RNF-07 | CA-40 | test | `package.json`, `tests/package-policy.test.ts` | package-policy.test: test_ca_07_* |
| RNF-08 | CA-41 | test | `src/install/apply.ts`, `tests/install/apply.test.ts` | apply.test: test_ca_41_* |
| RNF-09 | CA-42 | test | `src/install/targets.ts`, `tests/install/targets.test.ts` | targets.test: test_ca_42_* |

## Execution notes
- Segment rule (RF-21/RF-24): path segments are limited to `A-Za-z0-9._-` (optional leading dot, at most 64 chars, depth at most 9); the lock key pattern encodes the same rule without lookaround (the ReDoS rule bans it), so `..` cannot match.
- `tests/schemas-conformance.test.ts`: the provider-neutrality scan skips `schemas/install/` (the lock names the target CLIs by design).
- Tests inject `packageRoot`, `version`, `env` and file-system `ops` through `RunContext` (commands are called directly); `tests/fixtures/install/helpers.ts` holds the fixture builders.
- Items shared between local and kit are compared by namespace (skills and workflows share one; agents and rules each have their own).
- Lock key pattern (implementation detail of the Design): segments `\.?[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}`, up to 9 levels, no lookaround.
- Local collision namespaces: skills and workflows together; agents and rules separate.
- Docs (CA-36, RF-37) updated by the doc-writer in `docs/ARCHITECTURE.md`, `docs/INSTRUCTIONS.md` and `README.md`; ADR-0003 stays `proposed` until approval.

## Validation report
<!-- Filled by the validators (spec review and delivery validation). -->

### Spec review — 2026-10-12
```
MODO: A · VEREDITO: REPROVADO · VALIDADOR: spec-validator (Opus high)
SMOKE: n/a
ACHADOS:
1. [bloqueante] RF-24 x ADR-0003 x CA-20 — the ADR says "nothing is written" on conflict; RF-24 says "nothing else for that file"; CA-20 keeps the old hash in a rewritten lock. Partial apply leaves lock version N+1 with N content. → All-or-nothing: any conflict without --force writes nothing (lock included), exit 1; align ADR, RF-24, CA-20 (tree snapshot unchanged).
2. [bloqueante] RF-26 x RF-05 — sync source undefined (".agents/" vs "package only"). Lock 0.1.0 + npx 0.2.0 → sync installs 0.2.0 content under a 0.1.0 lock, or reads unverified project copies. Same for check (RF-27): with a newer package, every kit file is an orphan/drift. → Decide (see A/B): sync/check exit 1 with a version-mismatch finding when package != lock version (suggest update); missing/edited/orphan computed against the lock.
3. [bloqueante] RF-25 + lock schema — the lock is untrusted input and drives deletes. A PR adds "package.json": "sha256-<its current hash>"; the next update deletes package.json; a key under .agents/local/ breaks RF-16. update/sync with a missing or invalid lock is unspecified. → New RF + CA: validate the lock against its schema before any action (missing/invalid → exit 1, no write); write/delete only under managed prefixes (.agents/{skills,agents,rules,workflows,schemas}/, .agents/providers.json, .claude/{skills,agents,commands}/, AGENTS.md, CLAUDE.md), never .agents/local/ or .git/; encode the prefixes in the key pattern.
4. [bloqueante] RF-21 (Windows) — non-block files are hashed over raw bytes. Git for Windows (core.autocrlf=true by default) checks the .md files out as CRLF → check reports every file as edited, update/sync conflict on all of them. → Hash text files (no NUL byte) after CRLF→LF normalization and compare desired vs disk the same way; CA: CRLF tree → check exit 0, sync 0 writes. It belongs in lock v1 now.
5. [bloqueante] Unmanaged files — "on disk, not in lock = conflict" exists only in Design, only for init, with no RF/CA; init has no --force, and update --force could overwrite a user file the kit never created. → EARS RF in every command: a desired path on disk, absent from the lock, with content != desired is a conflict that --force does NOT override; content == desired → adopt into the lock. Add a CA.
6. [importante] RF-08 — malformed markers (two begins, end before begin, begin without end) are undefined; the risk is replacing user text up to EOF. → RF+CA: error with the path, exit 1, no write.
7. [importante] Crash consistency — no write order. → Lock written last (atomically, through apply); in the plan "disk == desired → no action/adopt" comes before the conflict rules; CA: abort after N files, the rerun converges with no conflicts.
8. [importante] RF-29/RNF-08 — (a) a project under a symlinked path (~/proj -> /data/proj, macOS /tmp) has every write refused → realpath the root once and lstat only below it; (b) sources in .agents/local/ are read without a symlink rule: references/key -> ~/.ssh/id_ed25519 copies the key into .agents/skills/x/references/key (committed). → Refuse symlinks and secret files (.env*, *.pem, service_account*) when reading local; extend CA-25/CA-33.
9. [importante] RF-15 (Windows) — destination of local items: require name == file/folder name (as in check --self) and validate each segment of references/ and scripts/ (no ":", trailing dot/space). The pattern at schemas/common.schema.json:12 accepts con, nul, aux, prn, com1, lpt1 → .claude/agents/nul.md misbehaves on Windows. → Reserved names in the list + CA.
10. [importante] RF-01/RF-30 (Windows) — detection must honor PATHEXT (claude.cmd, codex.exe) and never execute the binary; a Windows rename fails with EPERM/EBUSY while an editor or antivirus holds the file → bounded retry, then error with the path, exit 1, temp file removed. CA.
11. [importante] RF-11 — omitting tools when mcp is present gives the agent every tool (Edit/Write/Bash); an agent with read, search, mcp gets write and shell in Claude Code (against spec-05: validators without edit). → Decision C.
12. [importante] RF-10 — .claude/skills/<name>/ receives only SKILL.md; relative links to references/ (e.g. ears-requirements of spec-04) break in Claude Code. → Decision D; CA.
13. [importante] Missing RNF — size of the AGENTS.md block: Codex truncates project docs past project_doc_max_bytes (32 KiB by default); inline rules plus the local index can exceed it. → RNF with a limit (e.g. 24 KiB, error/warning with the size) + CA.
14. [importante] Closed list incomplete — tests/cli.test.ts:30 requires "check" without --self to exit 2 (RF-27 changes that) and is not in the list; src/catalog/collisions.json does not reach dist (tsconfig.json has no resolveJsonModule, tsc does not copy .json, src/ is not in "files"). → Add tests/cli.test.ts and tsconfig.json (or use collisions.ts) and state how the list is loaded.
15. [importante] RF-31 contradicts RF-04 (init again exits 1). → "sync, and update at the same version, with no change: 0 writes, lock not rewritten"; CA-27 snapshot with mtime (bytes alone pass on an identical rewrite) and a counter that includes the lock.
16. [menor] CLI: sync has no --force (RF-24/CA-20 use it); the TTY prompt of --yes has no RF/CA (suggest: print the detected list and continue, no prompt); a missing --root → exit 2.
17. [menor] "The implementation may add names" breaks the constants copied in 04 (CA-14) and 05 (CA-17) → freeze the list at approval. Today no name of 04/05 collides with the lists.
18. [menor] Deleting the last file leaves empty directories (define removal of empty managed dirs, never .agents/local/); executable bit of scripts/ on POSIX undefined.
19. [menor] Detecting .agents/ marks Antigravity whenever .agents/local/ already exists; the reason for .agents/schemas/ ("used by spec-06") does not match spec-06 RF-05 (<root>/schemas).
20. [menor] Merge order: specs 05 and 06 also edit docs/ARCHITECTURE.md and docs/INSTRUCTIONS.md (06); mention this in the Context.
CA SEM EVIDÊNCIA: n/a (Modo A)   · MANUAIS: CA-28
DECISÃO HUMANA NECESSÁRIA:
A. Conflict policy: all-or-nothing (recommended) | partial apply.
B. sync/check with package != lock version: refuse and suggest update (recommended) | render from project copies verified by the lock.
C. Claude agent with mcp: keep the mapped tools without MCP, least privilege (recommended) | omit tools (current, full privilege) | omit tools + disallowedTools for the built-ins not granted (if the Claude Code version supports it).
D. Assets of Claude skills: copy references/ and scripts/ into .claude/skills/<name>/ (recommended) | rewrite links to .agents/skills/<name>/.
```

Ciclo 1: achados endereçados (decisões A–D, `--root`, achados 3 a 20 aplicados na spec).

Ciclo 2: achados endereçados; aprovada pelo usuário sem 3º ciclo (2026-10-12).

### Spec review (cycle 2) — 2026-10-12
```
MODO: A · VEREDITO: REPROVADO · VALIDADOR: spec-validator (Opus high)
SMOKE: n/a
Cycle 1 findings 1–20: resolved. Decisions A–D, --root/--schemas, frozen list + Windows names, no prompt, sync --force: consistent with the RF, CA and ADR. Writer decisions accepted: --force only drops the lock entry of an edited removed file; block > 24 KiB = error; rename retry 5x in ~1 s.
ACHADOS:
1. [bloqueante] RF-28 / Plan rule (5) x RF-08 / CA-08 — the "except managed blocks" exception was lost. On init in a project with a hand-written AGENTS.md or CLAUDE.md (no block, not in the lock, content != desired), rule (5) gives an unmanaged-file conflict and init exits 1; CA-08 requires the append. This repository itself would fail. → In RF-28 and the Plan: "for AGENTS.md and CLAUDE.md the comparison is over the block: block absent → create (append, RF-08); block present and not in the lock → equal to desired = adopt, different = conflict (--force does not override)"; extend CA-27 with a hand-written AGENTS.md and no block → init exits 0.
2. [menor] Design (Lock) and RF-24 — "maxLength 260" on the files keys cannot be expressed in the subset (maxLength applies to values; there is no propertyNames). → Encode the bound in the pattern quantifier (e.g. {1,250}) and say so.
3. [menor] RF-10 — a rule body inlined in the block that contains "<!-- agent-kit:begin/end -->" yields nested markers, and the next run fails as malformed. → Refuse (path + exit 1) any inlined content containing the markers; one case in CA-10.
4. [menor] update with a package older than the lock version silently downgrades (and deletes files added by the newer version). → Refuse with version-downgrade, exit 1, unless --force; one case in CA-25.
5. [menor] Texts: Context (line 20) still says sync regenerates "from .agents/" (RF-30: package + .agents/local/); ADR-0003 says check "refuses to run" on version-mismatch (RF-31: reports it as a finding); the matrix row RNF-03 lacks CA-24.
CA SEM EVIDÊNCIA: n/a (Modo A)   · MANUAIS: CA-36
DECISÃO HUMANA NECESSÁRIA: second rejected cycle. Options: (a) apply the one-line fix of finding 1 (plus 2–5 if wanted) and approve without a third full cycle (recommended; the rest of the spec is consistent); (b) a third validation cycle.
```

### Delivery check (mecânico) — 2026-10-12
```
MODO: B · VEREDITO: APROVADO · VALIDADOR: spec-checker
SMOKE: OK (SMOKE OK ())
ACHADOS:
1. [menor] Escopo: docs/adr/README.md, docs/sdd/README.md e .claude/workflow.md fora da lista fechada do Design (todos docs/allowlist; workflow.md = hotspot collisions.json->collisions.ts, previsto no Context). tests/schemas-conformance.test.ts:772 (ignora schemas/install/ na neutralidade) = desvio declarado, justificado (o lock nomeia as CLIs) -> registrado, aceitar.
OK: 307 testes/gate (runner); zero deps (package.json e lockfile sem diff); docs na allowlist, sem "links where the OS allows", MCP roadmap em ARCHITECTURE:71-73 e README:48, 4 comandos em INSTRUCTIONS; commits no padrao com Refs; worktree limpo; CA-23 coberto pelo harness que descobre fixtures/schemas/install-lock por diretorio.
CA SEM EVIDENCIA: nenhum   · MANUAIS: CA-36
```

### Delivery validation (profunda) — 2026-10-12
```
MODO: B · VEREDITO: REPROVADO · VALIDADOR: spec-validator (Opus high)
SMOKE: OK (gate/spec-checker; 132 testes de install/conformance/cli/check-self reexecutados, worktree limpo)
ACHADOS:
1. [bloqueante] src/install/plan.ts:320,329 — AGENTS.md/CLAUDE.md são decodificados como UTF-8 e regravados: um AGENTS.md em Windows-1252 ("# A\xe7\xe3o") sai do init com os bytes e7 e3 trocados por ef bf bd (U+FFFD), exit 0. Viola RF-08 ("byte for byte"), perda silenciosa de texto do usuário. → Recusar arquivo que não faz round-trip UTF-8 (path + exit 1, nada escrito) ou emendar o bloco em bytes/latin1; caso no CA-08.
2. [bloqueante] src/install/plan.ts:53 — `.env*` virou `^\.env(\..*)?$`: `.envrc`, `.env-prod`, `.env_local` (e `ID_RSA`, padrão `^id_` sem /i) em `.agents/local/skills/s/references/` são lidos e copiados para `.agents/skills/s/references/` e `.claude/skills/s/references/` com exit 0. Viola RF-17/RNF-03/RNF-08. → `/^\.env/i` e `/^id_/i`; incluir esses nomes no CA-16.
3. [importante] src/install/apply.ts:188 — `ops.mkdir` fica fora do try: com `.claude/` somente leitura, o init grava `.agents/` e morre com exceção não tratada (EACCES, stack, caminho absoluto), sem mensagem com caminho relativo (RNF-06). O mesmo vale para `ops.readFile` sem tratamento em plan.ts:320/360/391 (arquivo ilegível). → Mover o mkdir para dentro do try e converter erros de leitura do plano em InstallError com o caminho relativo.
4. [importante] docs/INSTRUCTIONS.md:48 — ainda diz que `check` sem `--self` é erro de uso (exit 2), o que contradiz a tabela nova e o RF-31. → Remover o trecho. No mais, o CA-36 está ok: Install model, lock, colisões, 4 comandos com opções, MCP como roadmap, sem "links".
5. [menor] tests/install/local.test.ts:67 — o symlink do CA-16 fica em `skills/s/key`, não em `references/key` como diz o CA; o comportamento está coberto (scanLocal recusa), mas o caso do CA não é exercitado literalmente. → Mover o link para `references/key`.
CONFIRMADO: CA-23 (lock registrado como urn:agent-kit:install:lock:v1; o harness descobre tests/fixtures/schemas/install-lock por registry.ids → fixtureFolder; 2 válidos e 12 inválidos batem com cases.json em keyword/instancePath/contagem); nenhum teste usa cwd/worktree como raiz (helpers sempre passam tempDir; os casos de erro de uso em cli.test saem antes de rodar; worktree sem .agents/ nem lock); realpath da raiz + lstat abaixo dela, symlink/junction/`..`/absoluto/não gerenciado recusados no plano e de novo no apply; lock validado antes de agir (chaves fora dos prefixos, `nul`/ponto final barrados pelo resolveDest); tudo ou nada; lock por último e só quando muda; convergência depois de abort; CRLF no hash e nos blocos; marcadores malformados e dentro do conteúdo; version-mismatch/downgrade; tools nunca omitido; retry 5x; bloco ≤ 24 KiB; 0 escritas na idempotência.
CA SEM EVIDÊNCIA: nenhum   · MANUAIS: CA-36 (ok, exceto o achado 4)
DECISÃO HUMANA NECESSÁRIA: nenhuma
```
