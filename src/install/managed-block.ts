import { InstallError } from "./apply.js";

export const BEGIN = "<!-- agent-kit:begin -->";
export const END = "<!-- agent-kit:end -->";
const BEGIN_PREFIX = "<!-- agent-kit:begin";
const END_PREFIX = "<!-- agent-kit:end";
/** Size limit of a block (RNF-09). */
export const MAX_BLOCK_BYTES = 24 * 1024;

export type BlockState =
  | { kind: "none" }
  | { kind: "ok"; start: number; end: number; content: string }
  | { kind: "malformed"; reason: string };

function occurrences(text: string, needle: string): number[] {
  const found: number[] = [];
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) found.push(i);
  return found;
}

/** Locates the managed block of a document (`content` is LF-normalized, without the markers). */
export function findBlock(text: string): BlockState {
  const begins = occurrences(text, BEGIN_PREFIX);
  const ends = occurrences(text, END_PREFIX);
  if (begins.length === 0 && ends.length === 0) return { kind: "none" };
  if (begins.length > 1) return { kind: "malformed", reason: "more than one begin marker" };
  if (ends.length > 1) return { kind: "malformed", reason: "more than one end marker" };
  if (begins.length === 0) return { kind: "malformed", reason: "end marker without begin" };
  if (ends.length === 0) return { kind: "malformed", reason: "begin marker without end" };
  const b = begins[0] as number;
  const e = ends[0] as number;
  if (e < b) return { kind: "malformed", reason: "end marker before begin" };
  if (!text.startsWith(BEGIN, b) || !text.startsWith(END, e)) {
    return { kind: "malformed", reason: "unrecognized marker" };
  }
  const inner = text
    .slice(b + BEGIN.length, e)
    .replace(/\r\n/g, "\n")
    .replace(/^\n/, "")
    .replace(/\n$/, "");
  return { kind: "ok", start: b, end: e + END.length, content: inner };
}

/** Throws when content that would enter a block contains a marker. */
export function assertNoMarkers(text: string, path: string): void {
  if (text.includes(BEGIN_PREFIX) || text.includes(END_PREFIX)) {
    throw new InstallError(
      `${path}: content contains an agent-kit marker and cannot enter a managed block`,
    );
  }
}

/** New document text with `content` as its managed block (existing text kept byte for byte). */
export function applyBlock(existing: string | undefined, content: string): string {
  if (existing === undefined || existing === "") return `${BEGIN}\n${content}\n${END}\n`;
  const crlf = existing.includes("\r\n");
  const nl = crlf ? "\r\n" : "\n";
  const block = `${BEGIN}\n${content}\n${END}`.replace(/\n/g, nl);
  const state = findBlock(existing);
  if (state.kind === "malformed") throw new InstallError(`malformed markers: ${state.reason}`);
  if (state.kind === "ok")
    return existing.slice(0, state.start) + block + existing.slice(state.end);
  const sep = existing.endsWith("\n") ? nl : nl + nl;
  return `${existing}${sep}${block}${nl}`;
}
