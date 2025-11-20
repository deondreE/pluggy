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

  function parseNodes(stopTag?: string): Node[] {
    const nodes: Node[] = [];
    while (true) {
      const t = peek();
      if (!t) break;
      if (t.type === "eof") break;
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
        eat(); // consume "{"
        nodes.push(parseExpr());
        continue;
      }
      eat(); // safety
    }
    return nodes;
  }

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

  function parseElement(): Node {
    const open = eat(); // tagOpen
    const tag = (open as any).name;
    const attrs: Record<string, string | null> = {};
    const children = parseNodes(tag);
    return { type: "Element", tag, attrs, children };
  }
}
