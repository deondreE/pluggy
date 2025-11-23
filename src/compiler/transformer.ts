import type { Node } from "./parser";

export function optimize(ast: Node[]): Node[] {
  const out: Node[] = [];

  for (const node of ast) {
    if (node.type === "Element") {
      const optimizeChildren = optimize(node.children);
      out.push({
        ...node,
        children: optimizeChildren,
      });
      continue;
    }

    if (node.type === "Text" && !node.value.trim()) continue;

    const last = out[out.length - 1];
    if (node.type === "Text" && last?.type === "Text") {
      last.value += node.value;
      continue;
    } 

    if (node.type === "Expression") {
      if (/^[\d+\-*/ ().]+$/.test(node.code)) {
        try {
          const val = Function(`"use strict";return (${node.code});`)();
          out.push({ type: "Text", value: String(val) });
          continue;
        } catch {

        }
      }
    }

    out.push(node);
  }

  return out;
}
