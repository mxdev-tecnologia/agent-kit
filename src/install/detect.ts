import { delimiter, join } from "node:path";
import { CLIS, type Cli } from "../catalog/collisions.js";
import type { Ops } from "./apply.js";

const BINARIES: Record<Cli, string> = { claude: "claude", codex: "codex", antigravity: "agy" };

/** True when `name` is an executable candidate on PATH (never executed; honors PATHEXT). */
function onPath(name: string, env: NodeJS.ProcessEnv, platform: string, ops: Ops): boolean {
  const pathValue = env.PATH ?? env.Path ?? "";
  const pathext = env.PATHEXT ?? (platform === "win32" ? ".COM;.EXE;.BAT;.CMD" : "");
  const listed = pathext.split(";").filter((e) => e !== "");
  const exts = ["", ...new Set(listed.flatMap((e) => [e, e.toLowerCase()]))];
  for (const dir of pathValue.split(delimiter)) {
    if (dir === "") continue;
    for (const ext of exts) {
      try {
        const st = ops.lstat(join(dir, name + ext));
        if (st && (st.isFile || st.isSymlink)) return true;
      } catch {
        // unreadable directory: keep looking
      }
    }
  }
  return false;
}

function isDir(path: string, ops: Ops): boolean {
  return ops.lstat(path)?.isDirectory === true;
}

/** CLIs present: binaries on PATH or their folders in the project root (RF-01). */
export function detectClis(
  root: string,
  env: NodeJS.ProcessEnv,
  ops: Ops,
  platform: string = process.platform,
): Cli[] {
  const found = new Set<Cli>();
  for (const cli of CLIS) if (onPath(BINARIES[cli], env, platform, ops)) found.add(cli);
  if (isDir(join(root, ".claude"), ops)) found.add("claude");
  if (isDir(join(root, ".codex"), ops)) found.add("codex");
  const agents = join(root, ".agents");
  if (isDir(agents, ops) && ops.readdir(agents).some((e) => e.name !== "local")) {
    found.add("antigravity");
  }
  return CLIS.filter((c) => found.has(c));
}

/** Parses `--cli a,b`; returns the list or an error message listing the valid options. */
export function parseCliList(value: string): { clis: Cli[] } | { error: string } {
  const parts = value.split(",").map((p) => p.trim());
  const bad = parts.filter((p) => !(CLIS as readonly string[]).includes(p));
  if (bad.length > 0 || parts.length === 0) {
    return { error: `unknown --cli value "${bad.join(",")}"; valid options: ${CLIS.join(", ")}` };
  }
  return { clis: CLIS.filter((c) => parts.includes(c)) };
}
