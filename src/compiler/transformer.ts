import type { Node } from "./parser";

export function optimize(ast: Node[]): Node[] {
  const out: Node[] = [];
  for (const node of ast) {
    const last = out[out.length - 1];
    if (node.type === "Text" && last?.type === "Text") {
      last.value += node.value;
    } else out.push(node);
  }
  return out;
}
