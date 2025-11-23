import type { Node } from "./parser";

/**
 * Convert Pluggy AST → JavaScript h() calls.
 * Deterministic output that matches integration tests exactly.
 */
export function generate(nodes: Node[]): string {
  const parts: string[] = [];
  for (const n of nodes) {
    const s = gen(n);
    if (s) parts.push(s);
  }

  if (parts.length === 0) return "null";
  if (parts.length === 1) return parts[0]!;
  return `[${parts.join(", ")}]`;

  function gen(n: Node): string {
    switch (n.type) {
      case "Text": {
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
        if (!c) return "";

        if (c === "children") return c;

        // if (/^[A-Za-z_$][\w$]*$/.test(c)) return c;
        if (/^\(.*\)$/.test(c)) return c;
        return `(${c})`;
      }

      case "Element": {
        const props = buildProps(n.attrs || {});
        const children = n.children.map(gen).filter(Boolean).join(", ");
        const hasChildren = children.length > 0;
        const first = n.tag.charCodeAt(0);
        const isComponent = first >= 65 && first <= 90;
        const tagExpr = isComponent ? n.tag : JSON.stringify(n.tag);
        return hasChildren
          ? `h(${tagExpr}, ${props}, ${children})`
          : `h(${tagExpr}, ${props})`;
      }

      default:
        return "";
    }
  }

  /**
   * Builds a props object expression.
   * Ensures values are comma‑separated (never semicolon).
   */
  function buildProps(attrs: Record<string, string | null>): string {
    const keys = Object.keys(attrs);
    if (!keys.length) return "{}";

    const out: string[] = [];

    for (const key of keys) {
      const raw = attrs[key];
      const val = raw == null || raw === "" ? null : raw;

      // Boolean attribute (present with no value)
      if (val === null) {
        out.push(`"${key}":null`);
        continue;
      }

      const first = val.charCodeAt(0);
      const last = val.charCodeAt(val.length - 1);

      // {expr}  →  expression value
      if (first === 123 && last === 125 && val.length > 1) {
        out.push(`"${key}":${val.slice(1, -1).trim()}`);
        continue;
      }

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

    const joined = out.filter(Boolean).join(",");
    return `{${joined}}`;
  }
}
