/* eslint-disable no-new-func */
import { describe, it, expect } from "vitest";
import { tokenize } from "../src/compiler/lexer";
import { parse } from "../src/compiler/parser";
import { optimize } from "../src/compiler/transformer";
import { generate } from "../src/compiler/codegen";
import type { Node } from "../src/compiler/parser";

/* ───────────────────────── LEXER ───────────────────────── */
describe("lexer: tokenize", () => {
  it("tokenizes nested tags and expressions", () => {
    const src = `<div class="map"><h1>{msg}</h1><p>Hello</p></div>`;
    const tokens = tokenize(src);

    expect(tokens.map((t) => t.type)).toEqual([
      "tagOpen",
      "attrName",
      "attrValue",
      "tagOpen",
      "exprOpen",
      "text",
      "exprClose",
      "tagClose",
      "tagOpen",
      "text",
      "tagClose",
      "tagClose",
      "eof",
    ]);
    expect(tokens[0]).toMatchObject({ type: "tagOpen", name: "div" });
    expect(tokens[1]).toMatchObject({ type: "attrName", name: "class" });
    expect(tokens[2]).toMatchObject({ type: "attrValue", value: "map" });
  });

  it("handles plain text", () => {
    expect(tokenize("hello world")).toEqual([
      { type: "text", value: "hello world" },
      { type: "eof" },
    ]);
  });

  it("handles attribute expressions", () => {
    const src = `<input value={count} id="x">`;
    const tokens = tokenize(src);
    const names = tokens
      .filter((x) => x.type === "attrName")
      .map((x) => (x as any).name);
    const values = tokens
      .filter((x) => x.type === "attrValue")
      .map((x) => (x as any).value);
    expect(names).toContain("value");
    expect(values).toContain("count");
  });

  it("handles bare attributes", () => {
    const src = `<button disabled>`;
    const tokens = tokenize(src);
    expect(tokens.find((t) => t.type === "attrName")).toMatchObject({
      name: "disabled",
    });
  });

  it("handles self-closing tags", () => {
    const src = `<br/>`;
    const t = tokenize(src);
    expect(t.some((x) => x.type === "tagOpen")).toBe(true);
    expect(t.some((x) => x.type === "tagClose")).toBe(true);
  });
});

/* ───────────────────────── PARSER ───────────────────────── */
describe("parser: parse", () => {
  it("builds AST for nested structure", () => {
    const ast = parse(tokenize(`<div><h1>{msg}</h1><p>Hi</p></div>`));
    expect(ast).toEqual([
      {
        type: "Element",
        tag: "div",
        attrs: {},
        children: [
          {
            type: "Element",
            tag: "h1",
            attrs: {},
            children: [{ type: "Expression", code: "msg" }],
          },
          {
            type: "Element",
            tag: "p",
            attrs: {},
            children: [{ type: "Text", value: "Hi" }],
          },
        ],
      },
    ]);
  });

  it("parses attributes with string and expression values", () => {
    const ast = parse(tokenize(`<input value={count} id="x" disabled>`));
    expect(ast).toEqual([
      {
        type: "Element",
        tag: "input",
        attrs: { value: "count", id: "x", disabled: null },
        children: [],
      },
    ]);
  });

  it("parses self-closing / empty element", () => {
    const ast = parse(tokenize(`<br/>`));
    expect(ast).toEqual([
      { type: "Element", tag: "br", attrs: {}, children: [] },
    ]);
  });

  it("parses complex nested expression and text", () => {
    const ast = parse(tokenize(`<span>Hello {user.name + "!"}</span>`));
    expect(ast[0].children).toEqual([
      { type: "Text", value: "Hello " },
      { type: "Expression", code: 'user.name + "!"' },
    ]);
  });

  it("handles empty input safely", () => {
    expect(parse(tokenize(""))).toEqual([]);
  });
});

/* ───────────────────────── OPTIMIZER ─────────────────────── */
describe("optimizer", () => {
  it("merges adjacent text nodes", () => {
    const ast: Node[] = [
      { type: "Text", value: "Hello" },
      { type: "Text", value: " " },
      { type: "Text", value: "World" },
    ];
    expect(optimize(ast)).toEqual([{ type: "Text", value: "Hello World" }]);
  });

  it("leaves non-text nodes untouched", () => {
    const ast: Node[] = [
      { type: "Text", value: "A" },
      {
        type: "Element",
        tag: "b",
        attrs: {},
        children: [{ type: "Text", value: "Bold" }],
      },
      { type: "Text", value: "B" },
    ];
    expect(optimize(ast)).toEqual(ast);
  });

  it("applies recursively to child nodes", () => {
    const ast: Node[] = [
      {
        type: "Element",
        tag: "p",
        attrs: {},
        children: [
          { type: "Text", value: "Hi" },
          { type: "Text", value: " " },
          { type: "Text", value: "there" },
        ],
      },
    ];
    const out = optimize(ast);
    expect(out[0].children).toEqual([{ type: "Text", value: "Hi there" }]);
  });
});

/* ───────────────────────── CODEGEN ───────────────────────── */
describe("code generator", () => {
  it("renders text nodes to string literals", () => {
    expect(generate([{ type: "Text", value: "hi" }])).toBe('"hi"');
  });

  it("renders expression nodes to wrapped expressions", () => {
    expect(generate([{ type: "Expression", code: "count + 1" }])).toBe(
      "(count + 1)",
    );
  });

  it("renders simple element", () => {
    const ast: Node[] = [
      { type: "Element", tag: "div", attrs: {}, children: [] },
    ];
    expect(generate(ast)).toBe('h("div", {})');
  });

  it("renders nested elements", () => {
    const ast: Node[] = [
      {
        type: "Element",
        tag: "div",
        attrs: { id: "x" },
        children: [
          { type: "Text", value: "Hello " },
          { type: "Expression", code: "user" },
        ],
      },
    ];
    expect(generate(ast)).toBe('h("div", {"id":"x"}, "Hello ", (user))');
  });

  it("renders multiple attributes", () => {
    const ast: Node[] = [
      { type: "Element", tag: "div", attrs: { a: "1", b: "2" }, children: [] },
    ];
    expect(generate(ast)).toBe('h("div", {"a":"1","b":"2"})');
  });

  it("wraps multiple roots inside array", () => {
    const ast: Node[] = [
      { type: "Text", value: "A" },
      { type: "Text", value: "B" },
    ];
    expect(generate(ast)).toBe('["A", "B"]');
  });

  it("returns 'null' for empty AST", () => {
    expect(generate([])).toBe("null");
  });

  it("produces valid executable JS", () => {
    const ast: Node[] = [
      {
        type: "Element",
        tag: "p",
        attrs: {},
        children: [{ type: "Text", value: "x" }],
      },
    ];
    const code = generate(ast);
    const fn = new Function("h", `return ${code}`);
    const obj = fn((t: string, p: any, ...c: any[]) => ({ t, p, c }));
    expect(obj).toEqual({ t: "p", p: {}, c: ["x"] });
  });
});

/* ───────────────────────── INTEGRATION ────────────────────── */
describe("integration end‑to‑end", () => {
  const compile = (src: string) => {
    const ast1 = parse(tokenize(src));
    const ast2 = optimize(ast1);
    return generate(ast2);
  };

  it("compiles a small Pluggy component", () => {
    const src = `<div class="map"><h1>{msg}</h1><p>Rendered!</p></div>`;
    const code = compile(src);
    expect(code).toBe(
      'h("div", {"class":"map"}, h("h1", {}, (msg)), h("p", {}, "Rendered!"))',
    );
  });

  it("handles expression and bare attribute mix", () => {
    const src = `<input value={count} disabled>`;
    const code = compile(src);
    expect(code).toBe('h("input", {"value":"count","disabled":null})');
  });

  it("renders multi‑root templates as arrays", () => {
    const src = `<p>A</p><p>B</p>`;
    const code = compile(src);
    expect(code).toBe('[h("p", {}, "A"), h("p", {}, "B")]');
  });

  it("renders multi‑root templates as arrays", () => {
    const src = `<p>A</p><p>B</p>`;
    const code = compile(src);
    expect(code).toBe('[h("p", {}, "A"), h("p", {}, "B")]');
  });

  it("compiles each() loop expressions", () => {
    const src = `<ul>{each(todos, (item, i) => <li>{i}: {item}</li>)}</ul>`;
    const code = compile(src);
    expect(code).toBe(
      'h("ul", {}, (each(todos, (item, i) => h("li", {}, (i), ": ", (item)))))',
    );
  });
});
