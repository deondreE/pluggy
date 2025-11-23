import type { Token } from "./lexer";

export type Node =
  | {
      type: "Element";
      tag: string;
      attrs: Record<string, string | null>;
      children: Node[];
    }
  | { type: "Text"; value: string }
  | { type: "Expression"; code: string };

/**
 * Proper recursive‑descent parser for Pluggy JSX‑like tokens.
 */
export function parse(tokens: Token[]): Node[] {
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];

  return parseNodes();

  // --- main node list parser ---
  function parseNodes(stopTag?: string): Node[] {
    const nodes: Node[] = [];

    while (i < tokens.length) {
      const t = peek();
      if (!t || t.type === "eof") break;

      // closing tag
      if (t.type === "tagClose") {
        eat();
        if (t.name === stopTag) break;
        continue;
      }

      // element open
      if (t.type === "tagOpen") {
        nodes.push(parseElement());
        continue;
      }

      // text node
      if (t.type === "text") {
        eat();
        nodes.push({ type: "Text", value: t.value ?? "" });
        continue;
      }

      // { expr }
      if (t.type === "exprOpen") {
        eat();
        nodes.push(parseExpression());
        continue;
      }

      eat(); // ignore everything else
    }

    return nodes;
  }

  // --- { expression } block ---
  function parseExpression(): Node {
    let depth = 1;
    let code = "";

    while (i < tokens.length && depth > 0) {
      const t = peek();
      if (!t) break;

      if (t.type === "exprOpen") {
        depth++;
        code += eat().value ?? "{";
        continue;
      }
      if (t.type === "exprClose") {
        depth--;
        eat();
        if (depth === 0) break;
        code += "}";
        continue;
      }

      if (t.type === "tagOpen") {
        const node = parseElement();
        code += inline(node);
        continue;
      }

      code += t.value ?? t.name ?? "";
      eat();
    }

    return { type: "Expression", code: code.trim() };
  }

  function inline(n: Node): string {
    if (n.type === "Text") return JSON.stringify(n.value);
    if (n.type == "Expression") return `(${n.code})`;
    if (n.type == "Element") {
      const props = buildInlineProps(n.attrs);
      const children = n.children.map(inline).filter(Boolean).join(", ");
      const tag = /^[A-Z]/.test(n.tag) ? n.tag : `"${n.tag}"`;
      return children
        ? `h(${tag}, ${props}, ${children})`
        : `h(${tag}, ${props})`;
    }
  }

  function buildInlineProps(attrs: Record<string, string | null>): string {
    const out: string[] = [];
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v == "") {
        out.push(`"${k}":null`);
        continue;
      }
      out.push(`"${k}":${JSON.stringify(v)}`);
    }
    return `{${out.join(",")}}`;
  }

  // --- <tag ...attrs ...>children</tag> ---
  function parseElement(): Node {
    const open = eat()!;
    const tag = open.name!;
    const attrs: Record<string, string | null> = {};

    // collect attributes
    while (i < tokens.length) {
      const t = peek();
      if (!t) break;

      if (t.type === "attrName") {
        const attrName = eat()!.name!;
        let val: string | null = null;

        const n1 = peek();
        if (n1?.type === "attrValue") {
          val = eat()!.value ?? null;
        } else if (n1?.type === "exprOpen") {
          eat(); // {
          const exprParts: string[] = [];
          let depth = 1;
          while (i < tokens.length && depth > 0) {
            const tt = peek();
            if (!tt) break;
            if (tt.type === "exprOpen") depth++;
            else if (tt.type === "exprClose") depth--;
            if (depth === 0) {
              eat();
              break;
            }
            exprParts.push(eat().value ?? tt.name ?? "");
          }
          val = exprParts.join("").trim();
        }

        attrs[attrName] = val;
        continue;
      }

      // reached tag end or next element
      if (
        t.type === "tagClose" ||
        t.type === "text" ||
        t.type === "exprOpen" ||
        t.type === "tagOpen"
      )
        break;

      // self‑closing slash
      if (t.type === "slash") {
        eat();
        const t2 = peek();
        if (t2?.type === "tagEnd") eat();
        return { type: "Element", tag, attrs, children: [] };
      }

      eat();
    }

    // parse children if not self‑closing
    const children = parseNodes(tag);
    return { type: "Element", tag, attrs, children };
  }
}
