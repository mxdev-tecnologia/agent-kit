/** Frontmatter extraction and a restricted YAML-subset parser (grammar in docs/sdd/02a). */

export const MAX_FRONTMATTER_BYTES = 16 * 1024;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// C0 (except tab, LF, CR), DEL, C1 and the noncharacters U+FFFE and U+FFFF.
const FORBIDDEN_CHARS = /(?![\t\n\r])[\p{Cc}\uFFFE\uFFFF]/u;
const KEY = /^[A-Za-z][A-Za-z0-9_-]*$/;

export type FrontmatterScalar = string | number | boolean;
export type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[];
export type FrontmatterData = Record<string, FrontmatterValue>;

export type FrontmatterResult =
  | { ok: true; data: FrontmatterData; body: string }
  | { ok: false; error: string; line: number };

class FrontmatterError extends Error {
  constructor(
    readonly line: number,
    reason: string,
  ) {
    super(`line ${line}: ${reason}`);
  }
}

/** Splits a file into its frontmatter block and body, then parses the block. */
export function parseFrontmatter(input: string): FrontmatterResult {
  try {
    const text = input.startsWith("﻿") ? input.slice(1) : input;
    const { block, body } = extract(text);
    if (Buffer.byteLength(block, "utf8") > MAX_FRONTMATTER_BYTES) {
      throw new FrontmatterError(1, "frontmatter block is larger than 16 KiB");
    }
    const normalized = block.replace(/\r\n/g, "\n");
    const bad = FORBIDDEN_CHARS.exec(normalized);
    if (bad) {
      const line = normalized.slice(0, bad.index).split("\n").length + 1;
      const code = (bad[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
      throw new FrontmatterError(line, `control character U+${code} is not allowed`);
    }
    return { ok: true, data: parseBlock(normalized), body };
  } catch (error) {
    if (error instanceof FrontmatterError) {
      return { ok: false, error: error.message, line: error.line };
    }
    throw error;
  }
}

function lineEnd(text: string, from: number): { content: string; next: number } {
  const nl = text.indexOf("\n", from);
  if (nl === -1) return { content: text.slice(from), next: text.length };
  const raw = text.slice(from, nl);
  return { content: raw.endsWith("\r") ? raw.slice(0, -1) : raw, next: nl + 1 };
}

function extract(text: string): { block: string; body: string } {
  const open = lineEnd(text, 0);
  if (open.content !== "---") {
    throw new FrontmatterError(1, "the file does not start with a frontmatter block (---)");
  }
  let pos = open.next;
  while (pos < text.length) {
    const line = lineEnd(text, pos);
    if (line.content === "---") {
      return { block: text.slice(open.next, pos), body: text.slice(line.next) };
    }
    pos = line.next;
  }
  throw new FrontmatterError(1, "the frontmatter opened on line 1 is never closed (missing ---)");
}

const isBlank = (line: string) => /^[ \t]*$/.test(line);
const isComment = (line: string) => /^[ \t]*#/.test(line);
const indentOf = (line: string) => line.length - line.trimStart().length;

function checkIndent(line: string, no: number): void {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
  if (lead.includes("\t")) throw new FrontmatterError(no, "a tab in indentation is not allowed");
}

function parseBlock(block: string): FrontmatterData {
  const lines = block === "" ? [] : block.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const data = Object.create(null) as FrontmatterData;
  const seen = new Set<string>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const no = i + 2;
    if (isBlank(line)) {
      i++;
      continue;
    }
    checkIndent(line, no);
    if (isComment(line)) {
      i++;
      continue;
    }
    if (line.startsWith(" ")) {
      throw new FrontmatterError(
        no,
        /^\s+[A-Za-z_][\w-]*:( |$)/.test(line)
          ? "nested maps are not supported"
          : "unexpected indentation (nested maps and continuation lines are not supported)",
      );
    }
    const m = /^([^\s:]+):( .*|)$/.exec(line);
    if (!m) throw new FrontmatterError(no, lineProblem(line));
    const key = m[1] ?? "";
    const rest = m[2] ?? "";
    if (FORBIDDEN_KEYS.has(key)) throw new FrontmatterError(no, `the key "${key}" is not allowed`);
    if (!KEY.test(key)) throw new FrontmatterError(no, lineProblem(line));
    if (seen.has(key)) throw new FrontmatterError(no, `duplicate key "${key}"`);
    seen.add(key);

    const value = rest.trim();
    if (value === "" || value.startsWith("#")) {
      if (value.startsWith("#") && !/^\s/.test(rest)) {
        throw new FrontmatterError(no, "invalid comment");
      }
      const list = parseBlockList(lines, i + 1, key);
      data[key] = list.items;
      i = list.next;
    } else if (/^[|>]/.test(value)) {
      const scalar = parseBlockScalar(lines, i, value);
      data[key] = scalar.text;
      i = scalar.next;
    } else {
      data[key] = parseInline(value, no);
      i++;
    }
  }
  return data;
}

function lineProblem(line: string): string {
  const c = line[0] ?? "";
  if (c === "&") return "anchors are not supported";
  if (c === "*") return "aliases are not supported";
  if (c === "!") return "tags are not supported";
  if (c === "%") return "directives are not supported";
  if (c === "?") return "complex keys are not supported";
  if (c === "{" || c === "[") return "flow collections are not supported at the top level";
  if (c === "-") return "a list item must belong to a key (use `key:` followed by items)";
  return "expected `key: value` where the key matches [A-Za-z][A-Za-z0-9_-]*";
}

function parseBlockList(
  lines: string[],
  start: number,
  key: string,
): { items: FrontmatterScalar[]; next: number } {
  let i = start;
  while (i < lines.length && (isBlank(lines[i] ?? "") || isComment(lines[i] ?? ""))) i++;
  const first = lines[i] ?? "";
  const firstNo = i + 2;
  const keyNo = start + 1;
  if (i >= lines.length) {
    throw new FrontmatterError(keyNo, `key "${key}" has no value (use '' for an empty string)`);
  }
  checkIndent(first, firstNo);
  const indent = indentOf(first);
  if (!/^-( |$)/.test(first.slice(indent)) || (indent !== 0 && indent !== 2)) {
    if (indent > 0 && /^\s+[A-Za-z_][\w-]*:( |$)/.test(first)) {
      throw new FrontmatterError(firstNo, "nested maps are not supported");
    }
    throw new FrontmatterError(keyNo, `key "${key}" has no value (use '' for an empty string)`);
  }
  const items: FrontmatterScalar[] = [];
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const no = i + 2;
    if (isBlank(line) || isComment(line)) {
      i++;
      continue;
    }
    checkIndent(line, no);
    const here = indentOf(line);
    const content = line.slice(here);
    if (here === 0 && indent === 2 && !/^-( |$)/.test(content)) break;
    if (here === 0 && indent === 0 && !/^-( |$)/.test(content)) break;
    if (here !== indent || !/^-( |$)/.test(content)) {
      throw new FrontmatterError(no, "inconsistent list indentation");
    }
    const item = content.slice(1).trim();
    if (item === "" || item.startsWith("#")) {
      throw new FrontmatterError(no, "a bare `-` list item is not supported");
    }
    const value = parseInline(content.slice(2).trimStart(), no, true);
    items.push(value as FrontmatterScalar);
    i++;
  }
  return { items, next: i };
}

function parseBlockScalar(
  lines: string[],
  keyIndex: number,
  indicator: string,
): { text: string; next: number } {
  const no = keyIndex + 2;
  if (!/^[|>]-?$/.test(indicator)) {
    throw new FrontmatterError(
      no,
      "unsupported block scalar header (only |, |-, > and >- without comment)",
    );
  }
  const folded = indicator.startsWith(">");
  const strip = indicator.endsWith("-");
  let i = keyIndex + 1;
  let indent = -1;
  const content: string[] = [];
  const leadingBlanks: { length: number; line: number }[] = [];
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlank(line)) {
      if (indent < 0) leadingBlanks.push({ length: line.length, line: i + 2 });
      content.push(indent >= 0 && line.length > indent ? line.slice(indent) : "");
      i++;
      continue;
    }
    const here = indentOf(line);
    if (indent < 0) {
      checkIndent(line, i + 2);
      if (here === 0) {
        throw new FrontmatterError(i + 2, "block scalar content must be indented");
      }
      indent = here;
      for (const blank of leadingBlanks) {
        if (blank.length > indent) {
          throw new FrontmatterError(
            blank.line,
            "a leading blank line is indented more than the block scalar content",
          );
        }
      }
    } else if (here < indent) {
      break;
    } else if (line.slice(0, indent).includes("\t")) {
      throw new FrontmatterError(i + 2, "a tab in indentation is not allowed");
    }
    if (folded && /^[ \t]/.test(line.slice(indent))) {
      throw new FrontmatterError(i + 2, "more-indented lines in a folded scalar are not supported");
    }
    content.push(line.slice(indent));
    i++;
  }
  // Blank lines after the last content line belong to no scalar.
  while (content.length > 0 && isBlank(content[content.length - 1] ?? "")) content.pop();
  if (content.length === 0) return { text: "", next: i };
  if (folded && content.some((l) => l !== "" && isBlank(l))) {
    throw new FrontmatterError(
      keyIndex + 2,
      "whitespace-only lines in a folded scalar are not supported",
    );
  }
  let text: string;
  if (folded) {
    text = "";
    let pending = 0;
    let seenText = false;
    for (const l of content) {
      if (l === "") {
        pending++;
        continue;
      }
      text += seenText ? (pending === 0 ? " " : "\n".repeat(pending)) : "\n".repeat(pending);
      text += l;
      pending = 0;
      seenText = true;
    }
  } else {
    text = content.join("\n");
  }
  return { text: strip ? text : `${text}\n`, next: i };
}

function checkPlain(text: string, no: number): void {
  if (/^[*&!{}[\]@%`|>'"#,?:]/.test(text)) {
    const c = text[0];
    const why =
      c === "&"
        ? "anchors are not supported"
        : c === "*"
          ? "aliases are not supported"
          : c === "!"
            ? "tags are not supported"
            : `a plain scalar cannot start with "${c}" (quote it)`;
    throw new FrontmatterError(no, why);
  }
  if (/^-( |$)/.test(text)) {
    throw new FrontmatterError(no, "a plain scalar cannot be `-` or start with `- ` (nested list)");
  }
  if (/:[ \t]/.test(text) || text.endsWith(":")) {
    throw new FrontmatterError(no, "a plain scalar cannot contain `: ` (nested map; quote it)");
  }
}

function typeScalar(text: string, no: number): FrontmatterScalar {
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?(0|[1-9][0-9]*)$/.test(text)) {
    const n = Number(text);
    if (Math.abs(n) > MAX_SAFE) throw new FrontmatterError(no, "ambiguous number, quote it");
    return n === 0 ? 0 : n;
  }
  if (/^[+-]?[0-9]+$/.test(text) || /^0[xob][0-9a-fA-F]+$/.test(text)) {
    throw new FrontmatterError(no, "ambiguous number, quote it");
  }
  return text;
}

/** Reads a quoted scalar starting at `start`; returns the value and the index after the quote. */
function readQuoted(text: string, start: number, no: number): { value: string; end: number } {
  const quote = text[start];
  let out = "";
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (quote === "'") {
      if (ch === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        return { value: out, end: i + 1 };
      }
      out += ch;
      i++;
    } else if (ch === '"') {
      return { value: out, end: i + 1 };
    } else if (ch === "\\") {
      const esc = text[i + 1];
      const simple: Record<string, string> = {
        "\\": "\\",
        '"': '"',
        "/": "/",
        n: "\n",
        t: "\t",
        r: "\r",
      };
      if (esc !== undefined && Object.hasOwn(simple, esc)) {
        out += simple[esc];
        i += 2;
      } else if (esc === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
        out += String.fromCharCode(Number.parseInt(text.slice(i + 2, i + 6), 16));
        i += 6;
      } else {
        throw new FrontmatterError(no, `unsupported escape "\\${esc ?? ""}"`);
      }
    } else {
      out += ch;
      i++;
    }
  }
  throw new FrontmatterError(no, "unclosed quoted scalar (it must close on the same line)");
}

function checkTail(tail: string, no: number): void {
  if (tail.trim() !== "" && !/^[ \t]+#/.test(tail)) {
    throw new FrontmatterError(no, "unexpected content after the value");
  }
}

/** Parses the value part of `key: value` (or a list item when `inItem`). */
function parseInline(value: string, no: number, inItem = false): FrontmatterValue {
  const first = value[0];
  if (first === '"' || first === "'") {
    const q = readQuoted(value, 0, no);
    checkTail(value.slice(q.end), no);
    return q.value;
  }
  if (first === "[") {
    if (inItem) throw new FrontmatterError(no, "a nested list is not supported");
    return parseInlineList(value, no);
  }
  const cut = value.search(/[ \t]#/);
  const plain = (cut === -1 ? value : value.slice(0, cut)).replace(/[ \t]+$/, "");
  checkPlain(plain, no);
  return typeScalar(plain, no);
}

function parseInlineList(text: string, no: number): FrontmatterScalar[] {
  const items: FrontmatterScalar[] = [];
  let i = 1;
  const skip = () => {
    while (text[i] === " " || text[i] === "\t") i++;
  };
  skip();
  if (text[i] === "]") {
    checkTail(text.slice(i + 1), no);
    return items;
  }
  for (;;) {
    skip();
    const ch = text[i];
    if (ch === undefined) throw new FrontmatterError(no, "unclosed inline list");
    if (ch === '"' || ch === "'") {
      const q = readQuoted(text, i, no);
      items.push(q.value);
      i = q.end;
    } else {
      let j = i;
      while (j < text.length && text[j] !== "," && text[j] !== "]") {
        if (text[j] === "[" || text[j] === "{" || text[j] === "}") {
          throw new FrontmatterError(no, "nested lists and flow maps are not supported");
        }
        if (/[ \t]/.test(text[j] ?? "") && text[j + 1] === "#") {
          throw new FrontmatterError(no, "unclosed inline list");
        }
        j++;
      }
      if (j >= text.length) throw new FrontmatterError(no, "unclosed inline list");
      const plain = text.slice(i, j).replace(/[ \t]+$/, "");
      if (plain === "") throw new FrontmatterError(no, "empty element in inline list");
      checkPlain(plain, no);
      items.push(typeScalar(plain, no));
      i = j;
    }
    skip();
    if (text[i] === ",") {
      i++;
      skip();
      if (text[i] === "]") throw new FrontmatterError(no, "trailing comma in inline list");
      continue;
    }
    if (text[i] === "]") {
      checkTail(text.slice(i + 1), no);
      return items;
    }
    throw new FrontmatterError(no, i >= text.length ? "unclosed inline list" : "expected , or ]");
  }
}
