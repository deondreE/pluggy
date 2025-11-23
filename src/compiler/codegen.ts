import type { Node } from "./parser";

/**
 * Convert Pluggy AST → JavaScript h() calls.
 * Produces clean deterministic code
 * matching Pluggy's integration test expectations exactly.
 */
export function generate(nodes: Node[]): string {
  const parts: string[] = [];
  for (const n of nodes) {
    const s = gen(n);
    if (s) parts.push(s);
  }

  if (parts.length === 0) return "null";
  if (parts.length === 1) return parts[0]!;
  return "[" + parts.join(", ") + "]";

  /* ---------- Internal helpers ---------- */
  function gen(n: Node): string {
    switch (n.type) {
      case "Text": {
        // Collapse consecutive whitespace
        let v = n.value.replace(/\s+/g, " ");
        if (n.value.length && n.value.charCodeAt(0) <= 0x20 && v[0] !== " ")
          v = " " + v;
        const lv = n.value.length - 1;
        if (
          n.value.length &&
          n.value.charCodeAt(lv) <= 0x20 &&
          v[v.length - 1] !== " "
        )
          v += " ";
        if (!v.trim()) return "";
        return JSON.stringify(v);
      }

      case "Expression": {
        const c = n.code.trim();
        // Always wrap non-empty code for direct expression nodes
        // e.g. <p>{msg}</p> => (msg)
        // but if it's already parenthesized, leave as-is
        if (!c) return "";
        if (/^\(.*\)$/.test(c)) return c;
        return "(" + c + ")";
      }

      case "Element": {
        const props = buildProps(n.attrs ?? {});
        const childStr = n.children.map(gen).filter(Boolean).join(", ");
        const hasChildren = !!childStr.length;
        const first = n.tag.charCodeAt(0);
        const isComponent = first >= 65 && first <= 90; // upper-case first letter
        const tagExpr = isComponent ? n.tag : JSON.stringify(n.tag);
        return hasChildren
          ? `h(${tagExpr}, ${props}, ${childStr})`
          : `h(${tagExpr}, ${props})`;
      }

      default:
        return "";
    }
  }

  function buildProps(attrs: Record<string, string | null>): string {
    const keys = Object.keys(attrs);
    if (!keys.length) return "{}";
    const out: string[] = [];

    for (const key of keys) {
      const raw = attrs[key];
      const val = raw == null || raw === "" ? null : raw;

      if (val === null) {
        out.push(`"${key}":null`);
        continue;
      }

      const first = val.charCodeAt(0);
      const last = val.charCodeAt(val.length - 1);

      // {expr}
      if (first === 123 && last === 125 && val.length > 1) {
        // inside attr braces we don’t double-wrap
        out.push(`"${key}":${val.slice(1, -1).trim()}`);
        continue;
      }

      // Events: onClick, on:foo, etc.
      if (
        key.startsWith("on") ||
        (key.length > 3 && key[2] === ":") ||
        (key.length > 2 && key[0] === "o" && key[1] === "n")
      ) {
        out.push(`"${key}":${val}`);
        continue;
      }

      out.push(`"${key}":${JSON.stringify(val)}`);
    }

    return `{${out.join(",")}}`;
  }
}
