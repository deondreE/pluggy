/* eslint-disable no-new-func */
import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/compiler/lexer';
import { parse } from '../src/compiler/parser';
import { optimize } from '../src/compiler/transformer';
import { generate } from '../src/compiler/codegen';
import { compile } from '../src/compiler';
import type { Node } from '../src/compiler/parser';

/* ───────────────────────── LEXER ───────────────────────── */
describe('lexer: tokenize', () => {
  it('tokenizes nested tags and expressions', () => {
    const src = `<div class="map"><h1>{msg}</h1><p>Hello</p></div>`;
    const tokens = tokenize(src);

    expect(tokens.map((t) => t.type)).toEqual([
      'tagOpen',
      'attrName',
      'attrValue',
      'tagOpen',
      'exprOpen',
      'text',
      'exprClose',
      'tagClose',
      'tagOpen',
      'text',
      'tagClose',
      'tagClose',
      'eof',
    ]);
    expect(tokens[0]).toMatchObject({ type: 'tagOpen', name: 'div' });
    expect(tokens[1]).toMatchObject({ type: 'attrName', name: 'class' });
    expect(tokens[2]).toMatchObject({ type: 'attrValue', value: 'map' });
  });

  it('handles plain text', () => {
    expect(tokenize('hello world')).toEqual([
      { type: 'text', value: 'hello world' },
      { type: 'eof' },
    ]);
  });

  it('handles attribute expressions correctly', () => {
    const src = `<input value={count} id="x">`;
    const tokens = tokenize(src);
    const attrNames = tokens.filter((x) => x.type === 'attrName');
    const attrValues = tokens.filter((x) => x.type === 'attrValue');

    expect(attrNames.some((x) => (x as any).name === 'value')).toBe(true);
    expect(attrValues.some((x) => (x as any).value === 'count')).toBe(true);
  });

  it('handles bare attributes', () => {
    const src = `<button disabled>`;
    const tokens = tokenize(src);
    const attr = tokens.find((t) => t.type === 'attrName');
    expect(attr).toMatchObject({ name: 'disabled' });
  });

  it('handles self-closing tags', () => {
    const src = `<br/>`;
    const t = tokenize(src);
    expect(t.some((x) => x.type === 'tagOpen')).toBe(true);
    expect(t.some((x) => x.type === 'tagClose')).toBe(true);
  });
});

/* ───────────────────────── PARSER ───────────────────────── */
describe('parser: parse', () => {
  it('builds correct AST for nested structure', () => {
    const ast = parse(tokenize(`<div><h1>{msg}</h1><p>Hi</p></div>`));
    expect(ast).toEqual([
      {
        type: 'Element',
        tag: 'div',
        attrs: {},
        children: [
          {
            type: 'Element',
            tag: 'h1',
            attrs: {},
            children: [{ type: 'Expression', code: 'msg' }],
          },
          {
            type: 'Element',
            tag: 'p',
            attrs: {},
            children: [{ type: 'Text', value: 'Hi' }],
          },
        ],
      },
    ]);
  });

  it('parses attributes with string and expression values', () => {
    // note: expression value stored as 'count' (no braces)
    const ast = parse(tokenize(`<input value={count} id="x" disabled>`));
    expect(ast).toEqual([
      {
        type: 'Element',
        tag: 'input',
        attrs: { value: 'count', id: 'x', disabled: null },
        children: [],
      },
    ]);
  });

  it('parses self-closing element', () => {
    const ast = parse(tokenize(`<br/>`));
    expect(ast).toEqual([
      { type: 'Element', tag: 'br', attrs: {}, children: [] },
    ]);
  });

  it('parses text + expression mix correctly', () => {
    const ast = parse(tokenize(`<span>Hello {user.name + "!"}</span>`));
    expect(ast[0].children).toEqual([
      { type: 'Text', value: 'Hello ' },
      { type: 'Expression', code: 'user.name + "!"' },
    ]);
  });

  it('handles empty input safely', () => {
    expect(parse(tokenize(''))).toEqual([]);
  });
});

/* ───────────────────────── OPTIMIZER ───────────────────────── */
describe('optimizer', () => {
  it('merges adjacent text nodes', () => {
    const ast: Node[] = [
      { type: 'Text', value: 'Hello' },
      { type: 'Text', value: ' ' },
      { type: 'Text', value: 'World' },
    ];
    expect(optimize(ast)).toEqual([{ type: 'Text', value: 'Hello World' }]);
  });

  it('keeps non-text nodes intact', () => {
    const ast: Node[] = [
      { type: 'Text', value: '1' },
      {
        type: 'Element',
        tag: 'em',
        attrs: {},
        children: [{ type: 'Text', value: 'emphasis' }],
      },
      { type: 'Text', value: '2' },
    ];
    expect(optimize(ast)).toEqual(ast);
  });

  it('recursively merges inside children', () => {
    const ast: Node[] = [
      {
        type: 'Element',
        tag: 'p',
        attrs: {},
        children: [
          { type: 'Text', value: 'Hi' },
          { type: 'Text', value: ' ' },
          { type: 'Text', value: 'there' },
        ],
      },
    ];
    const out = optimize(ast);
    expect(out[0].children).toEqual([{ type: 'Text', value: 'Hi there' }]);
  });
});

/* ───────────────────────── CODEGEN ───────────────────────── */
describe('codegen: generate', () => {
  it('turns text node into string literal', () => {
    expect(generate([{ type: 'Text', value: 'Hello' }])).toBe('"Hello"');
  });

  it('turns expression node into evaluated parentheses', () => {
    expect(generate([{ type: 'Expression', code: 'x + 1' }])).toBe('(x + 1)');
  });

  it('builds element without children', () => {
    expect(
      generate([{ type: 'Element', tag: 'div', attrs: {}, children: [] }]),
    ).toBe('h("div", {})');
  });

  it('renders nested element', () => {
    const ast: Node[] = [
      {
        type: 'Element',
        tag: 'section',
        attrs: { id: 'hero' },
        children: [
          { type: 'Text', value: 'hi ' },
          { type: 'Expression', code: 'user' },
        ],
      },
    ];
    expect(generate(ast)).toBe('h("section", {"id":"hero"}, "hi ", (user))');
  });

  it('handles multiple attributes', () => {
    const ast: Node[] = [
      { type: 'Element', tag: 'div', attrs: { a: '1', b: '2' }, children: [] },
    ];
    expect(generate(ast)).toBe('h("div", {"a":"1","b":"2"})');
  });

  it('returns array for multi roots', () => {
    const ast: Node[] = [
      { type: 'Text', value: 'A' },
      { type: 'Text', value: 'B' },
    ];
    expect(generate(ast)).toBe('["A", "B"]');
  });

  it('returns null when ast empty', () => {
    expect(generate([])).toBe('null');
  });

  it('produces valid executable js', () => {
    const ast: Node[] = [
      {
        type: 'Element',
        tag: 'span',
        attrs: {},
        children: [{ type: 'Text', value: 'ok' }],
      },
    ];
    const code = generate(ast);
    const fn = new Function('h', `return ${code}`);
    const obj = fn((t: string, p: any, ...c: any[]) => ({ t, p, c }));
    expect(obj).toEqual({ t: 'span', p: {}, c: ['ok'] });
  });
});

/* ───────────────────────── INTEGRATION ───────────────────────── */
describe('integration', () => {
  it('compiles small Pluggy component', () => {
    const code = compile(
      `<div class="map"><h1>{msg}</h1><p>Rendered!</p></div>`,
    );
    expect(code).toBe(
      'h("div", {"class":"map"}, h("h1", {}, (msg)), h("p", {}, "Rendered!"))',
    );
  });

  it('supports expression + bare attributes', () => {
    const code = compile(`<input value={count} disabled>`);
    expect(code).toBe('h("input", {"value":"count","disabled":null})');
  });

  it('renders multi-root templates as arrays', () => {
    const code = compile(`<p>A</p><p>B</p>`);
    expect(code).toBe('[h("p", {}, "A"), h("p", {}, "B")]');
  });

  it('handles each() loop expressions', () => {
    const code = compile(
      `<ul>{each(todos, (item, i) => <li>{i}: {item}</li>)}</ul>`,
    );
    expect(code).toBe(
      'h("ul", {}, (each(todos, (item, i) => h("li", {}, (i), ": ", (item)))))',
    );
  });

  it('compiles uppercase tags as components', () => {
    const code = compile(
      `<MyButton label="Save" onClick={handleSave}>Click me</MyButton>`,
    );
    expect(code).toBe(
      'h(MyButton, {"label":"Save","onClick":handleSave}, "Click me")',
    );
  });
});
