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

      if (t.type === "tagClose") {
        eat();
        if (t.name === stopTag) break;
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
        eat();
        nodes.push(parseExpr());
        continue;
      }

      eat(); // skip unknown
    }
    return nodes;
  }

  /* { ... } expressions ----------------------------------- */
  function parseExpr(): Node {
    let code = "";
    while (true) {
      const tk = peek();
      if (!tk || tk.type === "eof" || tk.type === "exprClose") break;
      if (tk.type === "text" || tk.type === "attrValue")
        code += (eat() as any).value;
      else eat();
    }
    if (peek()?.type === "exprClose") eat();
    return { type: "Expression", code: code.trim() };
  }

  /* <tag ...attrs> ... </tag> ------------------------------ */
  function parseElement(): Node {
    const open = eat();
    const tag = (open as any).name;
    const attrs: Record<string, string | null> = {};

    // Read attributes until closing symbol `>` or next tag
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
        const name = (eat() as any).name;
        let val: string | null = null;

        const n1 = peek();

        // attr = "literal"
        if (n1?.type === "attrValue") {
          val = (eat() as any).value;
        }

        // attr = {expr}
        else if (n1?.type === "exprOpen") {
          eat(); // {
          if (peek()?.type === "attrValue") {
            val = (eat() as any).value;
          }
          if (peek()?.type === "exprClose") eat();
        }

        attrs[name] = val === undefined ? null : val;
        continue;
      }

      eat();
    }

    // Parse child content until matching close tag
    const children = parseNodes(tag);
    return { type: "Element", tag, attrs, children };
  }
}
