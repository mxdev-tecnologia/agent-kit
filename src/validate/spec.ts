import { type Issue, quote } from "./envelope-rules.js";

type Family = "RF" | "RNF" | "CA";

const SECTIONS = {
  fr: "Functional requirements",
  nfr: "Non-functional requirements",
  ac: "Acceptance criteria",
  matrix: "Traceability matrix",
} as const;

const FAMILY_OF: Record<string, Family> = {
  RF: "RF",
  FR: "RF",
  RNF: "RNF",
  NFR: "RNF",
  CA: "CA",
  AC: "CA",
};

// Linear patterns: no nested quantifiers, every quantifier is bounded by a distinct literal.
const HEADING = /^## (.*)$/;
const FENCE = /^\s{0,3}(```|~~~)/;
const STATUS = /^- \*\*Status:\*\*/;
const REQ_ITEM = /^- \*\*(RF|FR|RNF|NFR)-(\d{2,9})(?: \([^)]*\))?:\*\*(.*)$/;
const CA_ITEM = /^- \*\*(CA|AC)-(\d{2,9})\*\*(.*)$/;
const EARS_START = /^\s*(?:THE [^\s]+|WHEN|WHILE|IF|WHERE)(?:\s|$)/;
const SHALL = /\bSHALL\b/;
const ID_REF = /\b(RF|FR|RNF|NFR|CA|AC)-(\d{1,9})\b/g;
const PAREN = /\(([^)]*)\)/;
const GIVEN = /\b(?:Given|Dado)\b/g;
const WHEN = /\b(?:When|Quando)\b/g;
const THEN = /\b(?:Then|Então)\b/g;

interface Line {
  n: number;
  text: string;
}

interface Section {
  name: string;
  line: number;
  body: Line[];
}

interface Item {
  family: Family;
  num: number;
  id: string;
  line: number;
  text: string;
}

function canon(family: Family, num: number): string {
  return `${family}-${String(num).padStart(2, "0")}`;
}

function after(re: RegExp, text: string, from: number): number {
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? m.index + m[0].length : -1;
}

/** Splits the text into the header lines (before the first `## `) and the level-2 sections. */
function split(lines: string[]): { header: Line[]; sections: Section[] } {
  const header: Line[] = [];
  const sections: Section[] = [];
  let current: Section | undefined;
  let fenced = false;
  lines.forEach((text, i) => {
    const n = i + 1;
    if (FENCE.test(text)) fenced = !fenced;
    const h = fenced ? null : HEADING.exec(text);
    if (h) {
      current = { name: (h[1] ?? "").trim(), line: n, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push({ n, text });
    } else {
      header.push({ n, text });
    }
  });
  return { header, sections };
}

function isEmpty(section: Section): boolean {
  return section.body.every((l) => l.text.trim() === "" || /^\s*<!--.*-->\s*$/.test(l.text));
}

/** Collects the list items of a section that match `pattern`, with their continuation lines. */
function items(section: Section, pattern: RegExp): Item[] {
  const out: Item[] = [];
  let open: Item | undefined;
  for (const { n, text } of section.body) {
    if (/^(?:- |\* |\*\*|\||#)/.test(text)) open = undefined;
    const m = pattern.exec(text);
    if (m) {
      const family = FAMILY_OF[m[1] ?? ""];
      if (!family) continue;
      const num = Number(m[2]);
      open = { family, num, id: `${m[1]}-${m[2]}`, line: n, text: m[3] ?? "" };
      out.push(open);
    } else if (open && text.trim() !== "") {
      open.text += ` ${text.trim()}`;
    }
  }
  return out;
}

function cells(row: string): string[] {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.replace(/[*`]/g, "").trim());
}

function refs(text: string): { family: Family; num: number; raw: string }[] {
  const out: { family: Family; num: number; raw: string }[] = [];
  for (const m of text.matchAll(ID_REF)) {
    const family = FAMILY_OF[m[1] ?? ""];
    if (family) out.push({ family, num: Number(m[2]), raw: m[0] });
  }
  return out;
}

/** Checks a spec written in the kit's format (structure, EARS, ids, Given/When/Then, matrix). */
export function validateSpec(text: string, name: string): Issue[] {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const eof = lines.length;
  const issues: (Issue & { line: number })[] = [];
  const add = (line: number, rule: string, message: string) =>
    issues.push({ path: `${name}:${line}`, line, rule, message });

  const { header, sections } = split(lines);
  if (!header.some((l) => STATUS.test(l.text))) {
    add(1, "spec-header", "add a header line `- **Status:** <value>` before the first section");
  }

  const found = new Map<string, Section>();
  for (const s of sections) if (!found.has(s.name)) found.set(s.name, s);
  for (const wanted of Object.values(SECTIONS)) {
    const s = found.get(wanted);
    if (!s) add(eof, "spec-section", `missing section "## ${wanted}"; add it`);
    else if (isEmpty(s)) add(s.line, "spec-section", `section "## ${wanted}" is empty; fill it`);
  }

  const rf = found.has(SECTIONS.fr) ? items(found.get(SECTIONS.fr) as Section, REQ_ITEM) : [];
  const rnf = found.has(SECTIONS.nfr) ? items(found.get(SECTIONS.nfr) as Section, REQ_ITEM) : [];
  const ca = found.has(SECTIONS.ac) ? items(found.get(SECTIONS.ac) as Section, CA_ITEM) : [];
  const functional = rf.filter((i) => i.family === "RF");
  const nonFunctional = rnf.filter((i) => i.family === "RNF");
  const criteria = ca.filter((i) => i.family === "CA");

  // Ids: unique and sequential from 01 inside each family.
  const defined = new Set<string>();
  for (const family of [functional, nonFunctional, criteria]) {
    const seen = new Set<number>();
    let next = 1;
    for (const item of family) {
      if (seen.has(item.num)) {
        add(item.line, "duplicate-id", `id ${item.id} is used more than once; make it unique`);
        continue;
      }
      seen.add(item.num);
      if (item.num !== next) {
        const want = canon(item.family, next);
        add(item.line, "id-sequence", `id ${item.id} breaks the sequence; expected ${want}`);
      }
      next = item.num + 1;
      defined.add(canon(item.family, item.num));
    }
  }

  // EARS (lexical) on RF lines only.
  for (const item of functional) {
    if (!EARS_START.test(item.text)) {
      add(
        item.line,
        "ears",
        `${item.id} must start with THE <subject>, WHEN, WHILE, IF or WHERE; found "${quote(item.text.trim())}"`,
      );
    } else if (!SHALL.test(item.text)) {
      add(item.line, "ears", `${item.id} must contain the word SHALL`);
    }
  }

  // Acceptance criteria: Given/When/Then in order and at least one existing RF or RNF id.
  for (const item of criteria) {
    const body = item.text.replace(/\*\*/g, "");
    const g = after(GIVEN, body, 0);
    const w = g < 0 ? -1 : after(WHEN, body, g);
    const t = w < 0 ? -1 : after(THEN, body, w);
    if (t < 0) {
      add(
        item.line,
        "given-when-then",
        `${item.id} needs Given/When/Then (or Dado/Quando/Então) in that order`,
      );
    }
    const paren = PAREN.exec(item.text.replace(/\*\*/g, ""));
    const listed = refs(paren?.[1] ?? "").filter((r) => r.family !== "CA");
    if (listed.length === 0) {
      add(item.line, "dangling-ref", `${item.id} must reference at least one RF or RNF id`);
    }
    for (const r of listed) {
      if (!defined.has(canon(r.family, r.num))) {
        add(item.line, "dangling-ref", `${item.id} references ${r.raw}, which does not exist`);
      }
    }
  }

  // Traceability matrix.
  const matrix = found.get(SECTIONS.matrix);
  if (matrix) {
    const covered = new Set<string>();
    const rowSeen = new Set<string>();
    let inTable = false;
    for (const { n, text: row } of matrix.body) {
      if (!row.trimStart().startsWith("|")) {
        inTable = false;
        continue;
      }
      const wasTable = inTable;
      inTable = true;
      const c = cells(row);
      if (!wasTable || /^:?-+:?$/.test(c[0] ?? "")) continue;
      const first = refs(c[0] ?? "");
      const [req] = first;
      if (!req || req.family === "CA") {
        add(n, "matrix-ref", `first column "${quote(c[0] ?? "")}" is not a requirement id`);
        continue;
      }
      const reqId = canon(req.family, req.num);
      if (!defined.has(reqId)) {
        add(n, "matrix-ref", `row ${req.raw} refers to a requirement that does not exist`);
        continue;
      }
      rowSeen.add(reqId);
      const cas = refs(c[1] ?? "").filter((r) => r.family === "CA");
      let valid = 0;
      for (const r of cas) {
        if (defined.has(canon("CA", r.num))) valid++;
        else add(n, "matrix-ref", `row ${req.raw} refers to ${r.raw}, which does not exist`);
      }
      if (valid > 0) covered.add(reqId);
      else add(n, "matrix-coverage", `row ${req.raw} lists no existing CA id`);
    }
    for (const item of [...functional, ...nonFunctional]) {
      const id = canon(item.family, item.num);
      if (!covered.has(id) && !rowSeen.has(id)) {
        add(matrix.line, "matrix-coverage", `no matrix row with a CA covers ${item.id}`);
      }
    }
  }

  // Stable sort by line; the insertion order breaks ties.
  return issues
    .map((issue, order) => ({ issue, order }))
    .sort((a, b) => a.issue.line - b.issue.line || a.order - b.order)
    .map(({ issue: { path, rule, message } }) => ({ path, rule, message }));
}
