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

export function parse(tokens: Token[]): Node[] {
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];

  return parseNodes();

  /* ----------------------- Helpers ----------------------- */
  function parseNodes(stopTag?: string): Node[] {
    const nodes: Node[] = [];
    while (true) {
      const t = peek();
      if (!t || t.type === "eof") break;

      // closing tag
      if (t.type === "tagClose") {
        eat();
        if (t.name === stopTag) break;
        continue;
      }

      // nested element
      if (t.type === "tagOpen") {
        nodes.push(parseElement());
        continue;
      }

      // plain text
      if (t.type === "text") {
        nodes.push({ type: "Text", value: eat()?.value ?? "" });
        continue;
      }

      // { expression }
      if (t.type === "exprOpen") {
        eat();
        nodes.push(parseExpr());
        continue;
      }

      eat(); // skip anything else
    }
    return nodes;
  }

  /* { ... } expressions ----------------------------------- */
  function parseExpr(): Node {
    let depth = 1;
    const parts: string[] = [];

    while (i < tokens.length && depth > 0) {
      const t = peek();
      if (!t) break;

      switch (t.type) {
        case "exprOpen":
          depth++;
          eat();
          continue;

        case "exprClose":
          depth--;
          eat();
          if (depth === 0) break;
          continue;

        // --- Nested JSX element inside expression ---
        case "tagOpen": {
          const elem = parseElement();
          parts.push(inline(elem));
          continue;
        }

        // --- Text inside expression body ---
        case "text":
          parts.push(eat()?.value ?? "");
          continue;

        // --- Attribute names (e.g. variable or symbol text) ---
        default:
          if (t.name) {
            parts.push(eat()?.name!);
            continue;
          }
          eat();
          break;
      }
    }

    return { type: "Expression", code: parts.join("").trim() };

    /* Internal inline JSX → h() */
    function inline(n: Node): string {
      if (n.type === "Text") return JSON.stringify(n.value);
      if (n.type === "Expression") return `(${n.code})`;
      if (n.type === "Element") {
        const props = buildInlineProps(n.attrs);
        const kids = n.children.map(inline).filter(Boolean).join(", ");
        const tag = /^[A-Z]/.test(n.tag) ? n.tag : `"${n.tag}"`;
        return kids ? `h(${tag}, ${props}, ${kids})` : `h(${tag}, ${props})`;
      }
      return "";
    }

    function buildInlineProps(attrs: Record<string, string | null>): string {
      const out: string[] = [];
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === "") {
          out.push(`"${k}":null`);
          continue;
        }
        out.push(`"${k}":${JSON.stringify(v)}`);
      }
      return `{${out.join(",")}}`;
    }
  }

  /* <tag ...attrs> ... </tag> ------------------------------ */
  function parseElement(): Node {
    const open = eat();
    const tag = open?.name!;
    const attrs: Record<string, string | null> = {};

    while (true) {
      const t = peek();
      if (
        !t ||
        t.type === "eof" ||
        t.type === "tagOpen" ||
        t.type === "tagClose" ||
        t.type === "exprOpen" ||
        t.type === "text"
      )
        break;

      if (t.type === "attrName") {
        const name = eat()?.name!;
        let val: string | null = null;
        const n1 = peek();

        // attr = "literal"
        if (n1?.type === "attrValue") {
          val = eat()?.value ?? null;
        }
        // attr = {expr}
        else if (n1?.type === "exprOpen") {
          eat(); // {
          if (peek()?.type === "attrValue") {
            // get raw expression, store without braces
            val = eat()?.value ?? null;
          }
          if (peek()?.type === "exprClose") eat();
        }

        attrs[name] = val;
        continue;
      }

      eat();
    }

    // ---- children ----
    const children = parseNodes(tag);
    return { type: "Element", tag, attrs, children };
  }
}
