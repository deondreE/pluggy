import type { Token } from "./lexer";

/**
 * AST node types used throughout the Pluggy compiler.
 */
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
 * Handles nested elements, inline expressions, and attribute expressions.
 */
export function parse(tokens: Token[]): Node[] {
  let i = 0;

  const peek = () => tokens[i];
  const eat = () => tokens[i++];

  return parseNodes();

  // Main node list parser
  function parseNodes(stopTag?: string): Node[] {
    const nodes: Node[] = [];

    while (i < tokens.length) {
      const t = peek();
      if (!t || t.type === "eof") break;

      // closing tag (</div>)
      if (t.type === "tagClose") {
        eat();
        if (t.name === stopTag) break;
        continue;
      }

      // opening tag (<div> or <Comp>)
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

      // { expression }
      if (t.type === "exprOpen") {
        eat();
        nodes.push(parseExpression());
        continue;
      }

      // otherwise skip unknown token
      eat();
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
        code += "{";
        eat();
        continue;
      }

      if (t.type === "exprClose") {
        depth--;
        eat();
        if (depth === 0) break;
        code += "}";
        continue;
      }

      // nested element inside expression
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

  // --- inline helper: for converting inline JSX inside { } into h() calls ---
  function inline(n: Node): string {
    if (n.type === "Text") return JSON.stringify(n.value);
    if (n.type === "Expression") return `(${n.code})`;
    if (n.type === "Element") {
      const props = buildInlineProps(n.attrs);
      const children = n.children.map(inline).filter(Boolean).join(", ");
      const tag = /^[A-Z]/.test(n.tag) ? n.tag : `"${n.tag}"`;
      return children
        ? `h(${tag}, ${props}, ${children})`
        : `h(${tag}, ${props})`;
    }
    return "";
  }

  // --- used internally to build props objects for inline nodes ---
  function buildInlineProps(attrs: Record<string, string | null>): string {
    const out: string[] = [];
    for (const [key, valRaw] of Object.entries(attrs)) {
      const val = valRaw ?? null;
      if (val === null || val === "") {
        out.push(`"${key}":null`);
        continue;
      }

      const first = val.charCodeAt(0);
      const last = val.charCodeAt(val.length - 1);

      // {expr} → inline expression
      if (first === 123 && last === 125 && val.length > 1) {
        out.push(`"${key}":${val.slice(1, -1).trim()}`);
      } else {
        out.push(`"${key}":${JSON.stringify(val)}`);
      }
    }
    return `{${out.join(",")}}`;
  }

  // --- <tag ...attrs ...>children</tag> ---
  function parseElement(): Node {
    const open = eat()!; // tagOpen
    const tag = open.name!;
    const attrs: Record<string, string | null> = {};

    // Collect attributes
    while (i < tokens.length) {
      const t = peek();
      if (!t) break;

      // Attribute name
      if (t.type === "attrName") {
        const attrName = eat()!.name!;
        let val: string | null = null;

        const next = peek();

        if (next?.type === "attrValue") {
          // quoted or bare value
          val = eat()!.value ?? null;
        } else if (next?.type === "attrValueExpr") {
          val = `{${eat()!.value ?? ""}}`;
        } else if (next?.type === "exprOpen") {
          eat(); // consume '{'
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
            exprParts.push(eat()?.value ?? tt.name ?? "");
          }
          val = `{${exprParts.join("").trim()}}`;
        }

        attrs[attrName] = val;
        continue;
      }

      // reached tag end or nested node
      if (
        t.type === "tagClose" ||
        t.type === "text" ||
        t.type === "exprOpen" ||
        t.type === "tagOpen"
      )
        break;

      // @ts-ignore
      if (t.type === "slash") {
        eat();
        const t2 = peek();
        // @ts-ignore
        if (t2?.type === "tagEnd") eat();
        return { type: "Element", tag, attrs, children: [] };
      }

      eat(); // skip whitespace or unexpected token
    }

    // Parse children (if not self‑closing)
    const children = parseNodes(tag);
    return { type: "Element", tag, attrs, children };
  }
}