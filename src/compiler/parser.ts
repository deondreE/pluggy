import type { Token } from './lexer';
import { generate } from './codegen';

export type Node =
  | {
      type: 'Element';
      tag: string;
      attrs: Record<string, string | null>;
      children: Node[];
    }
  | { type: 'Text'; value: string }
  | { type: 'Expression'; code: string };

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
      if (!t || t!.type === 'eof') break;

      if (t!.type === 'tagClose') {
        eat();
        if (t!.name === stopTag) break;
        continue;
      }

      if (t!.type === 'tagOpen') {
        nodes.push(parseElement());
        continue;
      }

      if (t!.type === 'text') {
        nodes.push({ type: 'Text', value: (eat() as any).value });
        continue;
      }

      if (t!.type === 'exprOpen') {
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
    let depth = 1;
    const parts: string[] = [];

    while (i < tokens.length && depth > 0) {
      const t = tokens[i];

      if (t!.type === 'exprOpen') {
        depth++;
        eat();
        continue;
      }

      if (t!.type === 'exprClose') {
        depth--;
        eat();
        if (depth === 0) break;
        continue;
      }

      // nested element inside { ... }
      if (t!.type === 'tagOpen') {
        const elem = parseElement();
        parts.push(inline(elem));
        continue;
      }

      if ('value' in t! && typeof (t as any).value === 'string') {
        parts.push((eat() as any).value);
        continue;
      }

      if ('name' in t! && typeof (t as any).name === 'string') {
        parts.push((eat() as any).name);
        continue;
      }

      eat(); // skip other tokens
    }

    return { type: 'Expression', code: parts.join('').trim() };

    // --- compact inlined element to code ---
    function inline(n: Node): string {
      if (n.type === 'Text') return JSON.stringify(n.value);
      if (n.type === 'Expression') return `(${n.code})`;
      if (n.type === 'Element') {
        const props = buildInlineProps(n.attrs ?? {});
        const kids = n.children.map(inline).filter(Boolean).join(', ');
        const tag = /^[A-Z]/.test(n.tag) ? n.tag : `"${n.tag}"`;
        return kids ? `h(${tag}, ${props}, ${kids})` : `h(${tag}, ${props})`;
      }
      return '';
    }

    function buildInlineProps(attrs: Record<string, string | null>): string {
      const pairs: string[] = [];
      for (const [k, vRaw] of Object.entries(attrs)) {
        const v = vRaw ?? null;
        if (v === null || v === '') {
          pairs.push(`"${k}":null`);
          continue;
        }
        if (/^\{.*\}$/.test(v)) {
          pairs.push(`"${k}":(${v.slice(1, -1).trim()})`);
          continue;
        }
        pairs.push(`"${k}":${JSON.stringify(v)}`);
      }
      return `{${pairs.join(',')}}`;
    }
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
        t!.type === 'eof' ||
        t!.type === 'tagOpen' ||
        t!.type === 'tagClose' ||
        t!.type === 'exprOpen' ||
        t!.type === 'text'
      )
        break;

      if (t!.type === 'attrName') {
        const name = (eat() as any).name;
        let val: string | null = null;

        const n1 = peek();

        // attr = "literal"
        if (n1?.type === 'attrValue') {
          val = (eat() as any).value;
        }

        // attr = {expr}
        else if (n1?.type === 'exprOpen') {
          eat(); // {
          if (peek()?.type === 'attrValue') {
            val = (eat() as any).value;
          }
          if (peek()?.type === 'exprClose') eat();
        }

        attrs[name] = val === undefined ? null : val;
        continue;
      }

      eat();
    }

    // Parse child content until matching close tag
    const children = parseNodes(tag);
    return { type: 'Element', tag, attrs, children };
  }
}
