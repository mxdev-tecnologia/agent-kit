import { truncate } from "../schemas/validate.js";

/** One validation finding. `path` is `file:line` (text kinds) or a JSON Pointer (JSON kinds). */
export interface Issue {
  path: string;
  rule: string;
  message: string;
}

/** Quotes input text in a message: one line, at most 80 characters. */
export function quote(text: string): string {
  return truncate(text.replace(/\s+/g, " "));
}

/** The nine envelope kinds, in the `cortex.<kind>/v1` schema names. */
export const ENVELOPE_KINDS: readonly string[] = [
  "blocked",
  "design",
  "handoff",
  "lesson",
  "observation",
  "plan",
  "result",
  "task",
  "verdict",
];

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Reports every repeated `id` of the items of `list`, at `<base>/<n>/id`. */
function duplicateIds(list: unknown, base: string, what: string, out: Issue[]): void {
  const seen = new Set<string>();
  asArray(list).forEach((item, n) => {
    const id = isObj(item) ? item.id : undefined;
    if (typeof id !== "string") return;
    if (seen.has(id)) {
      out.push({
        path: `${base}/${n}/id`,
        rule: "duplicate-id",
        message: `${what} id "${quote(id)}" is used more than once; make each id unique`,
      });
    }
    seen.add(id);
  });
}

function planRules(body: Obj, out: Issue[]): void {
  const steps = asArray(body.steps);
  duplicateIds(steps, "/body/steps", "step", out);

  const first = new Map<string, number>();
  steps.forEach((step, n) => {
    const id = isObj(step) ? step.id : undefined;
    if (typeof id === "string" && !first.has(id)) first.set(id, n);
  });

  // Edges of the dependency graph; unknown targets are dangling references.
  const edges: { to: number; at: number }[][] = steps.map(() => []);
  steps.forEach((step, n) => {
    const deps = isObj(step) ? asArray(step.depends_on) : [];
    deps.forEach((dep, k) => {
      if (typeof dep !== "string") return;
      const target = first.get(dep);
      if (target === undefined) {
        out.push({
          path: `/body/steps/${n}/depends_on/${k}`,
          rule: "dangling-ref",
          message: `depends_on "${quote(dep)}" is not the id of any step; fix the id or remove it`,
        });
      } else {
        edges[n]?.push({ to: target, at: k });
      }
    });
  });

  // Iterative depth-first search: a back edge to a node still on the stack is a cycle.
  const state = new Array<number>(steps.length).fill(0);
  for (let start = 0; start < steps.length; start++) {
    if (state[start] !== 0) continue;
    const stack: { node: number; next: number }[] = [{ node: start, next: 0 }];
    state[start] = 1;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top) break;
      const edge = edges[top.node]?.[top.next];
      if (!edge) {
        state[top.node] = 2;
        stack.pop();
        continue;
      }
      top.next++;
      if (state[edge.to] === 1) {
        out.push({
          path: `/body/steps/${top.node}/depends_on/${edge.at}`,
          rule: "dependency-cycle",
          message: "this dependency closes a cycle; remove one dependency of the cycle",
        });
      } else if (state[edge.to] === 0) {
        state[edge.to] = 1;
        stack.push({ node: edge.to, next: 0 });
      }
    }
  }

  if (body.mode === "sequential" && typeof body.max_agents === "number" && body.max_agents !== 1) {
    out.push({
      path: "/body/max_agents",
      rule: "sequential-max-agents",
      message: "mode sequential requires max_agents 1; set max_agents to 1 or use mode parallel",
    });
  }
}

function verdictRules(body: Obj, out: Issue[]): void {
  const findings = asArray(body.findings);
  duplicateIds(findings, "/body/findings", "finding", out);
  if (body.decision === "rejected") {
    const blocking = findings.some(
      (f) => isObj(f) && (f.severity === "blocker" || f.severity === "major"),
    );
    if (!blocking) {
      out.push({
        path: "/body/findings",
        rule: "rejected-without-blocker",
        message: "decision rejected needs at least one finding with severity blocker or major",
      });
    }
  }
}

/**
 * Cross-field rules of the `cortex.<kind>/v1` envelopes that the schemas do not encode.
 * Tolerant of unreadable structure: it skips the parts that are not what the schema expects.
 */
export function crossFieldIssues(kind: string, value: unknown): Issue[] {
  const out: Issue[] = [];
  if (!isObj(value)) return out;
  if (typeof value.id === "string" && value.parent_id === value.id) {
    out.push({
      path: "/parent_id",
      rule: "parent-equals-id",
      message: "parent_id must differ from id; an envelope cannot be its own parent",
    });
  }
  const body = isObj(value.body) ? value.body : undefined;
  if (!body) return out;
  if (kind === "plan") planRules(body, out);
  else if (kind === "verdict") verdictRules(body, out);
  else if (kind === "blocked") duplicateIds(body.options, "/body/options", "option", out);
  else if (kind === "task") duplicateIds(body.acceptance, "/body/acceptance", "acceptance", out);
  return out;
}
