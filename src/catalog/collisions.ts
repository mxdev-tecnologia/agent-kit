/**
 * Names that a catalog or project item must not use (spec-03, RF-19). The list is frozen at spec
 * approval: native commands of each supported CLI and the reserved Windows device names.
 */

export const CLIS = ["claude", "codex", "antigravity"] as const;
export type Cli = (typeof CLIS)[number];

export const COLLISIONS: Readonly<Record<Cli, readonly string[]>> = {
  claude: [
    "add-dir",
    "agents",
    "bug",
    "clear",
    "compact",
    "config",
    "context",
    "cost",
    "doctor",
    "export",
    "help",
    "hooks",
    "ide",
    "init",
    "install-github-app",
    "login",
    "logout",
    "mcp",
    "memory",
    "model",
    "output-style",
    "permissions",
    "plugin",
    "pr-comments",
    "privacy-settings",
    "release-notes",
    "resume",
    "review",
    "rewind",
    "security-review",
    "status",
    "statusline",
    "terminal-setup",
    "todos",
    "upgrade",
    "usage",
    "vim",
  ],
  codex: [
    "approvals",
    "compact",
    "diff",
    "exit",
    "init",
    "logout",
    "mcp",
    "mention",
    "model",
    "new",
    "prompts",
    "quit",
    "review",
    "status",
    "undo",
  ],
  antigravity: ["help", "init", "memory", "review", "status", "start", "remember"],
};

export const RESERVED_NAMES: readonly string[] = [
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
];

/** True when a file name is a Windows device name (`nul`, `NUL.md`, `com1.txt`). */
export function isReservedWindowsName(fileName: string): boolean {
  const base = (fileName.split(".")[0] ?? "").toLowerCase();
  return RESERVED_NAMES.includes(base);
}

/** One message per collision of `name` with the given CLIs and the reserved Windows names. */
export function nameCollisions(name: string, clis: readonly Cli[] = CLIS): string[] {
  const problems: string[] = [];
  const hit = clis.filter((cli) => COLLISIONS[cli].includes(name));
  if (hit.length > 0) {
    problems.push(`name "${name}" collides with a native command of ${hit.join(", ")}`);
  }
  if (RESERVED_NAMES.includes(name)) {
    problems.push(`name "${name}" is a reserved Windows name`);
  }
  return problems;
}
