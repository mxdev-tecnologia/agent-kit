import { describe, expect, it } from "vitest";
import { MAX_FRONTMATTER_BYTES, parseFrontmatter } from "../src/schemas/frontmatter.js";

const doc = (block: string, body = "") => `---\n${block}\n---\n${body}`;

function data(block: string): Record<string, unknown> {
  const r = parseFrontmatter(doc(block));
  if (!r.ok) throw new Error(`unexpected error for ${JSON.stringify(block)}: ${r.error}`);
  return { ...r.data };
}

function failure(text: string) {
  const r = parseFrontmatter(text);
  if (r.ok) throw new Error(`expected an error for ${JSON.stringify(text)}`);
  return r;
}

describe("extraction", () => {
  it("test_ca_13_bom_is_ignored", () => {
    const r = parseFrontmatter(`\uFEFF${doc("a: 1")}`);
    expect(r).toMatchObject({ ok: true, data: { a: 1 } });
  });

  it("test_ca_13_missing_opening_line", () => {
    for (const text of [
      "",
      "a: 1\n---\n",
      "\n---\na: 1\n---\n",
      " ---\na: 1\n---\n",
      "--- \na: 1\n---\n",
    ]) {
      const r = failure(text);
      expect(r.error).toMatch(/frontmatter/);
      expect(r.line).toBe(1);
    }
  });

  it("test_ca_13_missing_closing_line_reports_opening_line", () => {
    const r = failure("---\na: 1\nb: 2\n");
    expect(r.error).toContain("line 1");
    expect(r.error).toMatch(/never closed/);
  });

  it("test_ca_13_body_follows_the_closing_line", () => {
    const r = parseFrontmatter("---\na: 1\n---\n# Title\n\n---\ntext\n");
    expect(r).toMatchObject({ ok: true, data: { a: 1 }, body: "# Title\n\n---\ntext\n" });
    expect(parseFrontmatter("---\na: 1\n---")).toMatchObject({ ok: true, body: "" });
    expect(parseFrontmatter("---\n---\nbody")).toMatchObject({ ok: true, data: {}, body: "body" });
    expect(parseFrontmatter("---\r\na: 1\r\n---\r\nbody\r\n")).toMatchObject({
      ok: true,
      body: "body\r\n",
    });
  });
});

describe("accepted grammar", () => {
  it("test_ca_14_comments_blank_lines_and_plain_scalars", () => {
    expect(
      data(
        "# top comment\n\nname: hello world  # trailing\n  # indented comment\ndesc:   spaced   \nhash: a#b\nurl: http://x.y/z",
      ),
    ).toEqual({ name: "hello world", desc: "spaced", hash: "a#b", url: "http://x.y/z" });
  });

  it("test_ca_14_quoted_scalars", () => {
    expect(data("a: 'it''s'\nb: \"say \\\"hi\\\"\"\nc: ''\nd: \"\"")).toEqual({
      a: "it's",
      b: 'say "hi"',
      c: "",
      d: "",
    });
    expect(data('a: "\\\\ \\" \\/ \\n \\t \\r \\u00e9 \\ud83d\\ude00"')).toEqual({
      a: '\\ " / \n \t \r é 😀',
    });
    expect(data("a: 'x # y' # real comment\nb: \"p # q\" # c")).toEqual({ a: "x # y", b: "p # q" });
    expect(data("a: 'null'\nb: '12'\nc: 'true'")).toEqual({ a: "null", b: "12", c: "true" });
  });

  it("test_ca_14_scalar_typing", () => {
    expect(
      data("i: 42\nneg: -5\nzero: 0\nnegzero: -0\nt: true\nf: false\nmax: 9007199254740991"),
    ).toEqual({ i: 42, neg: -5, zero: 0, negzero: 0, t: true, f: false, max: 9007199254740991 });
    expect(
      data(
        "n: null\ntilde: ~\ndate: 2026-01-02\nfloat: 1.5\nT: True\nF: FALSE\ny: yes\nu: 1_000\nexp: 1e3\ndash: -",
      ),
    ).toEqual({
      n: "null",
      tilde: "~",
      date: "2026-01-02",
      float: "1.5",
      T: "True",
      F: "FALSE",
      y: "yes",
      u: "1_000",
      exp: "1e3",
      dash: "-",
    });
  });

  it("test_ca_14_inline_lists", () => {
    expect(
      data(
        "a: [x, y z, 'q, r', \"s, t\"]\nb: []\nc: [1, true, 'v', -2, null]\nd: [ ]\ne: [a,b] # note\nf: [ a , b ]",
      ),
    ).toEqual({
      a: ["x", "y z", "q, r", "s, t"],
      b: [],
      c: [1, true, "v", -2, "null"],
      d: [],
      e: ["a", "b"],
      f: ["a", "b"],
    });
  });

  it("test_ca_14_block_lists", () => {
    expect(
      data(
        "a: # comment\n  - x\n  - 'y: z'\n  # between\n  - 3\nb:\n- p\n- q # c\nc:\n  - only\nd: after",
      ),
    ).toEqual({ a: ["x", "y: z", 3], b: ["p", "q"], c: ["only"], d: "after" });
    expect(data("a:\n\n  - x\n\n  - y\n")).toEqual({ a: ["x", "y"] });
  });

  it("test_ca_14_block_scalars", () => {
    expect(
      data(
        "a: |\n  l1\n  l2\nb: |-\n  l1\n  l2\nc: >\n  f1\n  f2\n\n  f3\nd: >-\n  f1\n  f2\ne: x",
      ),
    ).toEqual({
      a: "l1\nl2\n",
      b: "l1\nl2",
      c: "f1 f2\nf3\n",
      d: "f1 f2",
      e: "x",
    });
    // # inside a block scalar is content; deeper indentation of a literal is kept.
    expect(data("a: |\n  # not a comment\n    deeper\n\n\n  last\n\nb: 1")).toEqual({
      a: "# not a comment\n  deeper\n\n\nlast\n",
      b: 1,
    });
    expect(data("a: |\n  x\n# comment at column 0\nb: 1")).toEqual({ a: "x\n", b: 1 });
  });

  it("test_ca_14_values_have_null_prototype", () => {
    const r = parseFrontmatter(doc("a: 1"));
    if (!r.ok) throw new Error(r.error);
    expect(Object.getPrototypeOf(r.data)).toBeNull();
  });
});

describe("rejected grammar", () => {
  // [description, block, expected line number in the file (opening --- is line 1)]
  const cases: [string, string, number][] = [
    ["empty value", "a: 1\nb:", 3],
    ["empty value before next key", "a:\nb: 1", 2],
    ["plain with colon-space", "a: b: c", 2],
    ["plain ending with colon", "a: b:", 2],
    ["starts with *", "a: *x", 2],
    ["starts with &", "a: &x", 2],
    ["starts with !", "a: !x", 2],
    ["starts with {", "a: {x}", 2],
    ["starts with @", "a: @x", 2],
    ["starts with %", "a: %x", 2],
    ["starts with ?", "a: ?x", 2],
    ["starts with colon", "a: :x", 2],
    ["starts with comma", "a: ,x", 2],
    ["starts with ]", "a: ]x", 2],
    ["starts with }", "a: }x", 2],
    ["starts with backtick", "a: `x", 2],
    ["starts with dash-space", "a: - x", 2],
    ["unclosed inline list", "a: [a", 2],
    ["text after inline list", "a: [a] b", 2],
    ["unsupported escape", 'a: "\\q"', 2],
    ["bad unicode escape", 'a: "\\u12"', 2],
    ["multi-line double quote", 'a: "x\n  y"', 2],
    ["multi-line single quote", "a: 'x\n  y'", 2],
    ["text after quoted", "a: 'x' y", 2],
    ["glued comment after quoted", "a: 'x'#y", 2],
    ["keep chomping", "a: |+\n  x", 2],
    ["indentation digit", "a: |2\n  x", 2],
    ["comment after indicator", "a: | # c\n  x", 2],
    ["nested list", "a:\n  - - x", 3],
    ["list item mapping", "a:\n  - k: v", 3],
    ["bare dash", "a:\n  -", 3],
    ["inconsistent list indent", "a:\n  - x\n- y", 4],
    ["trailing comma", "a: [a, b,]", 2],
    ["empty element", "a: [a,,b]", 2],
    ["nested inline list", "a: [a, [b]]", 2],
    ["flow map in list", "a: [{x}]", 2],
    ["plus integer", "a: +1", 2],
    ["leading zero", "a: 007", 2],
    ["negative leading zero", "a: -007", 2],
    ["hex", "a: 0x1F", 2],
    ["octal marker", "a: 0o17", 2],
    ["binary marker", "a: 0b101", 2],
    ["too large", "a: 9007199254740992", 2],
    ["too small", "a: -9007199254740992", 2],
    ["list ambiguous number", "a: [1, 007]", 2],
    ["continuation line", "a: first\n  second", 3],
    ["more-indented folded line", "a: >\n  x\n    y", 4],
    ["block scalar at column 0", "a: |\nx", 3],
    ["key with space", "my key: v", 2],
    ["key with colon", "a:b: v", 2],
    ["quoted key", "'a': v", 2],
    ["no colon", "just text", 2],
    ["key starting with digit", "1a: v", 2],
    ["flow map at top", "{a: 1}", 2],
    ["top-level list item", "- a", 2],
    ["directive", "%YAML 1.2", 2],
    ["merge key", "<<: x", 2],
    ["complex key", "? a", 2],
    ["document end marker", "a: 1\n...", 3],
  ];

  it.each(cases)("test_ca_15_rejects_%s", (_name, block, line) => {
    const r = failure(doc(block));
    expect(r.line).toBe(line);
    expect(r.error).toContain(`line ${line}`);
  });

  const forbidden: [string, string, number][] = [
    ["nested map", "a:\n  b: 1", 3],
    ["nested map after scalar", "a: 1\n  b: 2", 3],
    ["anchor", "a: &x 1", 2],
    ["anchor on key line", "&x a: 1", 2],
    ["alias", "a: *x", 2],
    ["tag", "a: !!str x", 2],
    ["duplicate key", "a: 1\nb: 2\na: 3", 4],
    ["tab in indentation", "a:\n\t- x", 3],
    ["tab before key", "\ta: 1", 2],
    ["tab in list indentation", "a:\n  - x\n\t- y", 4],
    ["__proto__ key", "__proto__: 1", 2],
    ["constructor key", "x: 1\nconstructor: 1", 3],
    ["prototype key", "prototype: x", 2],
    ["__proto__ key with list", "__proto__:\n  - a", 2],
  ];

  it.each(forbidden)("test_ca_16_rejects_%s", (_name, block, line) => {
    const r = failure(doc(block));
    expect(r.line).toBe(line);
    expect(r.error).toContain(`line ${line}`);
  });

  it("test_ca_16_error_messages_name_the_cause", () => {
    expect(failure(doc("a: 1\na: 2")).error).toMatch(/duplicate/);
    expect(failure(doc("__proto__: 1")).error).toMatch(/not allowed/);
    expect(failure(doc("a:\n  b: 1")).error).toMatch(/nested/);
    expect(failure(doc("a: &x 1")).error).toMatch(/anchor/);
    expect(failure(doc("a: *x")).error).toMatch(/alias/);
    expect(failure(doc("a: !t x")).error).toMatch(/tag/);
    expect(failure(doc("a:\n\t- x")).error).toMatch(/tab/);
  });

  it("test_ca_16_line_numbers_count_from_the_opening_line", () => {
    expect(failure("---\n\n# c\nok: 1\nbad line\n---\n").line).toBe(5);
    expect(failure("\uFEFF---\nbad line\n---\n").line).toBe(2);
  });
});

describe("size and line endings", () => {
  const limit = MAX_FRONTMATTER_BYTES;
  /** A block (text between the delimiters) of exactly `bytes` UTF-8 bytes, with LF line ends. */
  function blockOf(bytes: number, eol = "\n"): string {
    const filler = `# ${"x".repeat(60)}${eol}`;
    let block = "";
    while (Buffer.byteLength(block) + filler.length <= bytes - 20) block += filler;
    const rest = bytes - Buffer.byteLength(block);
    // last line: key plus a comment padding to hit the exact size
    const tail = `k: v #${"p".repeat(rest - Buffer.byteLength(`k: v #${eol}`))}${eol}`;
    return block + tail;
  }
  const file = (block: string) => `---\n${block}---\nbody`;

  it("test_ca_17_limit_is_16_kib_of_raw_block_bytes", () => {
    expect(limit).toBe(16384);
    const exact = blockOf(limit);
    expect(Buffer.byteLength(exact)).toBe(limit);
    expect(parseFrontmatter(file(exact))).toMatchObject({ ok: true, data: { k: "v" } });
    const over = blockOf(limit + 1);
    expect(Buffer.byteLength(over)).toBe(limit + 1);
    const r = failure(file(over));
    expect(r.error).toMatch(/16 KiB/);
  });

  it("test_ca_17_size_counts_utf8_bytes_and_raw_crlf", () => {
    // Multi-byte characters: 4097 x 4 bytes = 16388 > 16384 although only 4097 characters.
    const wide = `k: v #${"😀".repeat(4097)}\n`;
    expect(failure(file(wide)).error).toMatch(/16 KiB/);
    // CRLF block: raw size above the limit, LF-normalized size below it.
    const lf = blockOf(limit - 10);
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(Buffer.byteLength(crlf)).toBeGreaterThan(limit);
    expect(parseFrontmatter(file(lf)).ok).toBe(true);
    expect(failure(`---\r\n${crlf}---\r\nbody`).error).toMatch(/16 KiB/);
  });

  it("test_ca_18_lf_and_crlf_give_equal_results", () => {
    const text =
      "# c\nname: demo\nlist:\n  - a\n  - 'b c'\ninline: [x, 1, true]\nlit: |\n  one\n  two\nfold: >-\n  a\n  b\n\n  c\nq: \"x\\ny\"\nn: 5\n";
    const lf = parseFrontmatter(`---\n${text}---\nbody\n`);
    const crlf = parseFrontmatter(`---\r\n${text.replace(/\n/g, "\r\n")}---\r\nbody\r\n`);
    expect(lf.ok).toBe(true);
    expect(crlf.ok).toBe(true);
    if (lf.ok && crlf.ok) {
      expect({ ...crlf.data }).toEqual({ ...lf.data });
      expect(lf.data).toMatchObject({ lit: "one\ntwo\n", fold: "a b\nc" });
    }
  });
});
