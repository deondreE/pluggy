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
        const lead = /^\s/.test(n.value);
        const trail = /\s$/.test(n.value);
        if (lead && !value.startsWith(" ")) value = " " + value;
        if (trail && !value.endsWith(" ")) value += " ";
        if (value.trim() === "") return "";
        return JSON.stringify(value);
      }

      case "Expression":
        return `(${n.code})`;

      case "Element": {
        const props = buildProps(n.attrs ?? {});
        const children = n.children.map(gen).filter(Boolean).join(", ");
        return children
          ? `h(${JSON.stringify(n.tag)}, ${props}, ${children})`
          : `h(${JSON.stringify(n.tag)}, ${props})`;
      }

      default:
        return "";
    }
  }

  function buildProps(attrs: Record<string, string | null>): string {
    const pairs: string[] = [];

    for (const [key, raw] of Object.entries(attrs)) {
      const val = raw ?? null;

      if (val === null || val === "") {
        pairs.push(`"${key}":null`);
        continue;
      }

      if (key === "class" || key === "id") {
        pairs.push(`"${key}":${JSON.stringify(val)}`);
        continue;
      }

      if (key.startsWith("on") || key.startsWith("on:")) {
        pairs.push(`"${key}":${val}`);
        continue;
      }

      if (/^\{.*\}$/.test(val)) {
        pairs.push(`"${key}":(${val.slice(1, -1).trim()})`);
        continue;
      }

      if (/^[a-zA-Z_$][\w.$]*$/.test(val)) {
        pairs.push(`"${key}":${val}`);
        continue;
      }

      pairs.push(`"${key}":${JSON.stringify(val)}`);
    }

    return `{${pairs.join(",")}}`;
  }
}
