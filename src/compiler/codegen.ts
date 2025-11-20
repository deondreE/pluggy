import type { Node } from "./parser";

export function generate(nodes: Node[]): string {
  const parts = nodes.map(gen).filter(Boolean);

  if (parts.length === 0) return "null";
  if (parts.length === 1) return parts[0]!;
  return `[${parts.join(", ")}]`;

  function gen(n: Node): string {
    switch (n.type) {
      case "Text": {
        let value = n.value.replace(/\s+/g, " ");
        const hasLeading = /^\s/.test(n.value);
        const hasTrailing = /\s$/.test(n.value);

        if (hasLeading && !value.startsWith(" ")) value = " " + value;
        if (hasTrailing && !value.endsWith(" ")) value = value + " ";

        if (value.trim() === "") return "";
        return JSON.stringify(value);
      }
      case "Expression":
        return `(${n.code})`;
      case "Element": {
        const props = JSON.stringify(n.attrs ?? {});
        const children = n.children.map(gen).filter(Boolean).join(", ");
        if (children)
          return `h(${JSON.stringify(n.tag)}, ${props}, ${children})`;
        return `h(${JSON.stringify(n.tag)}, ${props})`;
      }
      default:
        return "";
    }
  }
}
