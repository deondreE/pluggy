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

  // ----------------------------------------------------
  // Build props: keep on:* handler references intact
  // ----------------------------------------------------
  function buildProps(attrs: Record<string, string | null>): string {
    const pairs: string[] = [];

    for (const [key, val] of Object.entries(attrs)) {
      if (val == null || val === "") {
        pairs.push(`"${key}":true`);
        continue;
      }

      // on:* → function reference
      if (key.startsWith("on:")) {
        const expr = /^\{.*\}$/.test(val) ? val.slice(1, -1).trim() : val;
        pairs.push(`"${key}":${expr}`);
        continue;
      }

      // other attributes
      if (/^\{.*\}$/.test(val)) {
        pairs.push(`"${key}":(${val.slice(1, -1).trim()})`);
      } else {
        pairs.push(`"${key}":${JSON.stringify(val)}`);
      }
    }

    return `{${pairs.join(",")}}`;
  }
}
