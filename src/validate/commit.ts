import { type Issue, quote } from "./envelope-rules.js";

const TYPES = new Set([
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "build",
  "ci",
  "chore",
  "security",
]);
const MAX_HEADER = 100;
const HEADER = /^([A-Za-z]+)(?:\(([^()]*)\))?: ?(.*)$/;
const SCOPE = /^[a-z0-9-]+$/;
const REFS = /^Refs:(.*)$/;

/** Checks a commit message: header format, length, blank line and `Refs:`. The language is not checked. */
export function validateCommit(text: string, name: string): Issue[] {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const header = lines[0] ?? "";
  if (header.startsWith("Merge ")) return [];

  const issues: Issue[] = [];
  const at = (line: number) => `${name}:${line}`;
  const bad = (line: number, rule: string, message: string) =>
    issues.push({ path: at(line), rule, message });

  const match = HEADER.exec(header);
  if (!match) {
    bad(
      1,
      "commit-header",
      `header "${quote(header)}" does not match <type>(<scope>)?: <description>`,
    );
  } else {
    const [, type = "", scope, description = ""] = match;
    if (!TYPES.has(type)) {
      bad(1, "commit-header", `type "${quote(type)}" is not one of ${[...TYPES].join(", ")}`);
    }
    if (scope !== undefined && !SCOPE.test(scope)) {
      bad(1, "commit-header", `scope "${quote(scope)}" must match [a-z0-9-]+`);
    }
    if (description.trim() === "") {
      bad(1, "commit-header", "description is empty; say what the commit does");
    } else if (description.trimEnd().endsWith(".")) {
      bad(1, "commit-header", "description must not end with a period");
    }
  }

  if (Array.from(header).length > MAX_HEADER) {
    bad(1, "commit-length", `header has more than ${MAX_HEADER} characters; shorten it`);
  }
  if (lines.length > 1 && (lines[1] ?? "").trim() !== "") {
    bad(2, "commit-blank-line", "leave a blank line between the header and the body");
  }
  lines.forEach((line, n) => {
    const refs = REFS.exec(line);
    if (refs && (refs[1] ?? "").trim() === "") {
      bad(
        n + 1,
        "commit-refs",
        "Refs: has no value; list the spec or issue ids or remove the line",
      );
    }
  });
  return issues;
}
