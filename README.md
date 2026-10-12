# agent-kit

**A portable spec-driven development (SDD) brain for AI coding CLIs.**

agent-kit installs a complete, provider-neutral set of skills, agents, workflows, rules, JSON schemas and validators into any repository, in the native locations of each CLI you use. The same SDD runs the same way in Claude Code, Codex and Antigravity.

> **Status:** planning. The first release is being specified in [`docs/sdd/README.md`](docs/sdd/README.md). Nothing is published yet.

## What it will do

```bash
npx @mxdev-tecnologia/agent-kit init
```

1. Detects the CLIs installed on your machine and used by the project.
2. Writes the shared brain: `AGENTS.md` and `.agents/` (skills, agents, workflows, rules).
3. Adds each CLI's native glue: `CLAUDE.md` importing `@AGENTS.md` and `.claude/` for Claude Code; Codex and Antigravity read `AGENTS.md` and `.agents/` directly.
4. Records the installed version and file hashes in `agent-kit.lock.json`. All files are generated copies, never symlinks.

Later, `agent-kit update` brings the project to a newer version and `agent-kit sync` regenerates the targets, both keeping your project-specific files in `.agents/local/` and never overwriting files you edited without `--force`. `agent-kit check` fails when generated files drift or a name collides with a CLI's built-in command.

## What is inside

| Part | Contents |
|---|---|
| Workflows | `/triage`, `/spec`, `/design`, `/tasks`, `/build`, `/verify`, `/ship`, `/sync`, `/ui-lanes`, `/debug`, `/critique`, `/learn`, `/progress` |
| Agents | 13 roles with full job titles: orchestrator, scout, planner, architect, builder, verifier, reviewer, ui-designer, doc-writer, runner, security, releaser, observer |
| Skills | EARS requirements, acceptance criteria, task breakdown, traceability, verification evidence, context budget, git flow, security audit, project memory, design lanes |
| Rules | Always-on core protocol, safety, economy and design rules |
| Schemas | JSON Schemas for agent envelopes: `cortex.task/v1`, `cortex.result/v1`, `cortex.blocked/v1`, `cortex.verdict/v1`, `cortex.plan/v1`, `cortex.handoff/v1`, `cortex.lesson/v1`, `cortex.design/v1` and `cortex.observation/v1` |
| Validators | `agent-kit validate spec`, `tasks`, `commit`, `verdict`: deterministic gates that cost zero tokens |

## Principles

- **Any model, any agent.** Agents define a role, tools and a contract, never a model.
- **Author ≠ verifier.** The agent that builds never validates its own work.
- **Gates in code.** Structural checks run as scripts before any model review.
- **Minimal context.** Skills are loaded on demand; every task has a budget.

## Supported CLIs

| CLI | Instructions | Skills | Agents | Workflows |
|---|---|---|---|---|
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | `.claude/skills/` | `.claude/agents/` | `.claude/commands/` |
| Codex | `AGENTS.md` | `.agents/skills/` | roles in `AGENTS.md` | as skills |
| Antigravity | `AGENTS.md` | `.agents/skills/` | `.agents/agents/` | `.agents/workflows/` |

MCP access for agents is on the roadmap; agents installed today get no MCP tools.

See [`docs/INSTRUCTIONS.md`](docs/INSTRUCTIONS.md) for the commands and options.

## Contributing and security

- Contribution guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Reporting vulnerabilities: [`SECURITY.md`](SECURITY.md)

## License

[MIT](LICENSE)
