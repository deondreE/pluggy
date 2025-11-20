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

  // ----------------------------------------------------
  // Recursive‑descent helpers
  // ----------------------------------------------------
  function parseNodes(stopTag?: string): Node[] {
    const nodes: Node[] = [];
    while (true) {
      const t = peek();
      if (!t) break;
      if (t.type === "eof") break;
      if (t.type === "tagClose") {
        eat();
        if (t.name === stopTag) break; // </tag>
        continue;
      }
      if (t.type === "tagOpen") {
        nodes.push(parseElement());
        continue;
      }
      if (t.type === "text") {
        nodes.push({ type: "Text", value: (eat() as any).value });
        continue;
      }
      if (t.type === "exprOpen") {
        eat(); // consume "{"
        nodes.push(parseExpr());
        continue;
      }
      eat(); // safety: skip unexpected token
    }
    return nodes;
  }

  // ----------------------------------------------------
  // { ... } expressions
  // ----------------------------------------------------
  function parseExpr(): Node {
    let code = "";
    while (true) {
      const tk = peek();
      if (!tk || tk.type === "eof" || tk.type === "exprClose") break;
      if (tk.type === "text") code += (eat() as any).value;
      else eat();
    }
    if (peek() && peek()!.type === "exprClose") eat();
    return { type: "Expression", code: code.trim() };
  }

  // ----------------------------------------------------
  // <tag ...attrs> ... </tag>
  // ----------------------------------------------------
  function parseElement(): Node {
    const open = eat(); // tagOpen
    const tag = (open as any).name;
    const attrs: Record<string, string | null> = {};

    // --- collect attributes until something else (child, closing, etc.) ---
    while (true) {
      const t = peek();
      if (!t) break;
      if (t.type === "attrName") {
        const name = (eat() as any).name;
        let val: string | null = null;

        // possible attrValue, exprOpen + attrValue, or bare attr
        if (peek()?.type === "attrValue") {
          val = (eat() as any).value;
        } else if (peek()?.type === "exprOpen") {
          eat(); // {
          if (peek()?.type === "attrValue") {
            val = (eat() as any).value;
          }
          if (peek()?.type === "exprClose") eat(); // }
        }

        attrs[name] = val;
        continue;
      }
      // stop attributes when encountering child content / >
      if (
        t.type === "text" ||
        t.type === "tagOpen" ||
        t.type === "exprOpen" ||
        t.type === "tagClose"
      ) {
        break;
      }
      // consume any stray token (e.g., whitespace)
      if (t.type === "eof") break;
      eat();
    }

    // parse children until closing tag
    const children = parseNodes(tag);
    return { type: "Element", tag, attrs, children };
  }
}
