import type { Node } from './parser';

export function generate(nodes: Node[]): string {
  const parts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const s = gen(nodes[i]!);
    if (s) parts.push(s);
  }

  if (parts.length === 0) return 'null';
  if (parts.length === 1) return parts[0]!;
  return '[' + parts.join(', ') + ']';

  /* ---------------- Helpers ---------------- */
  function gen(n: Node): string {
    switch (n.type) {
      case 'Text': {
        // Collapse whitespace, but preserve single leading/trailing space
        let v = n.value.replace(/\s+/g, ' ');
        if (n.value.length && n.value.charCodeAt(0) <= 0x20 && v[0] !== ' ')
          v = ' ' + v;
        const lv = n.value.length - 1;
        if (
          n.value.length &&
          n.value.charCodeAt(lv) <= 0x20 &&
          v[v.length - 1] !== ' '
        )
          v += ' ';
        if (!v.trim()) return '';
        return JSON.stringify(v);
      }

      case 'Expression': {
        // Expression code inserted directly
        return '(' + n.code + ')';
      }

      case 'Element': {
        const props = buildProps(n.attrs ?? {});
        const children = n.children
          ? n.children.map(gen).filter(Boolean).join(', ')
          : '';

        // Capital letter = Component reference; else DOM element string
        const firstCode = n.tag.charCodeAt(0);
        const isComponent = firstCode >= 65 && firstCode <= 90;
        const tagExpr = isComponent ? n.tag : JSON.stringify(n.tag);

        if (children.length)
          return 'h(' + tagExpr + ', ' + props + ', ' + children + ')';
        return 'h(' + tagExpr + ', ' + props + ')';
      }

      default:
        return '';
    }
  }

  function buildProps(attrs: Record<string, string | null>): string {
    const keys = Object.keys(attrs);
    if (keys.length === 0) return '{}';

    const out: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const raw = attrs[key];
      const val = raw == null || raw === '' ? null : raw;

      if (val === null) {
        out.push('"' + key + '":null');
        continue;
      }

      const first = val.charCodeAt(0);
      const last = val.charCodeAt(val.length - 1);

      // {expr}
      if (first === 123 && last === 125 && val.length > 1) {
        out.push('"' + key + '":(' + val.slice(1, -1).trim() + ')');
        continue;
      }

      // Event handlers like onClick / on:foo
      if (
        key.startsWith('on') ||
        (key.length > 3 && key[2] === ':') ||
        (key.length > 2 && key[0] === 'o' && key[1] === 'n')
      ) {
        out.push('"' + key + '":' + val);
        continue;
      }

      // Plain string attribute
      out.push('"' + key + '":' + JSON.stringify(val));
    }

    return '{' + out.join(',') + '}';
  }
}
