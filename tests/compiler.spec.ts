import { describe, it, expect } from "vitest";
import { tokenize } from "../src/compiler/lexer";
import { parse } from "../src/compiler/parser";
import { optimize } from "../src/compiler/transformer";
import { generate } from "../src/compiler/codegen";
import type { Node } from "../src/compiler/parser";

/* ------------------------- Optimizer ------------------------- */
describe("optimizer", () => {
  it("merges adjacent text nodes", () => {
    const ast: Node[] = [
      { type: "Text", value: "Hello" },
      { type: "Text", value: " " },
      { type: "Text", value: "World" },
    ];
    expect(optimize(ast)).toEqual([{ type: "Text", value: "Hello World" }]);
  });

  it("leaves other node types untouched", () => {
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
    const out = optimize(ast);
    expect(out).toEqual(ast);
  });
});

/* --------------------- Code Generator ------------------------ */
describe("code generator", () => {
  it("renders text nodes to string literals", () => {
    expect(generate([{ type: "Text", value: "hi" }])).toBe(
      JSON.stringify("hi"),
    );
  });

  it("renders expression nodes to wrapped expressions", () => {
    expect(generate([{ type: "Expression", code: "count + 1" }])).toBe(
      "(count + 1)",
    );
  });

  it("renders an element without children", () => {
    const ast: Node[] = [
      { type: "Element", tag: "div", attrs: {}, children: [] },
    ];
    expect(generate(ast)).toBe('h("div", {})');
  });

  it("renders nested elements and children", () => {
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

  it("wraps multiple root nodes in an array", () => {
    const ast: Node[] = [
      { type: "Text", value: "A" },
      { type: "Text", value: "B" },
    ];
    expect(generate(ast)).toBe('["A", "B"]');
  });

  it("returns 'null' for empty AST", () => {
    expect(generate([])).toBe("null");
  });

  it("produces valid JavaScript syntax for evaluation", () => {
    const ast: Node[] = [
      {
        type: "Element",
        tag: "p",
        attrs: {},
        children: [{ type: "Text", value: "safe" }],
      },
    ];
    const code = generate(ast);
    // eslint-disable-next-line no-new-func
    const fn = new Function("h", `return ${code}`);
    const result = fn((tag: string, props: any, ...c: any[]) => ({
      tag,
      props,
      children: c,
    }));
    expect(result).toEqual({
      tag: "p",
      props: {},
      children: ["safe"],
    });
  });
});

/* ----------------------- Integration ------------------------- */
describe("generate", () => {
  it("creates clean h() calls", () => {
    const ast: Node[] = [
      {
        type: "Element",
        tag: "div",
        attrs: { class: "map" },
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
            children: [
              { type: "Text", value: "Custom syntax rendering successful." },
            ],
          },
        ],
      },
    ];
    const js = generate(ast);
    expect(js).toBe(
      'h("div", {"class":"map"}, h("h1", {}, (msg)), h("p", {}, "Custom syntax rendering successful."))',
    );
  });
});

describe("lexer attributes", () => {
  it("detects attrName/value", () => {
    const tokens = tokenize(`<input type="text" id="x">`);
    const names = tokens
      .filter((t) => t.type === "attrName")
      .map((t) => (t as any).name);
    const values = tokens
      .filter((t) => t.type === "attrValue")
      .map((t) => (t as any).value);
    expect(names).toEqual(["type", "id"]);
    expect(values).toEqual(["text", "x"]);
  });

  it("handles expression attributes", () => {
    const tokens = tokenize(`<input value={count} disabled>`);
    const names = tokens
      .filter((t) => t.type === "attrName")
      .map((t) => (t as any).name);
    const values = tokens
      .filter((t) => t.type === "attrValue")
      .map((t) => (t as any).value);
    expect(names).toContain("value");
    expect(values).toContain("count");
  });
});

/* ───────────── Parser ───────────── */
describe("parser attributes", () => {
  it("parses string, expr and bare attrs", () => {
    const ast = parse(tokenize(`<input type="text" value={count} disabled>`));
    expect(ast).toEqual([
      {
        type: "Element",
        tag: "input",
        attrs: { type: "text", value: "count", disabled: null },
        children: [],
      },
    ]);
  });
});

/* ------------------------- Lexer ----------------------------- */
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

  it("handles plain text", () => {
    const tokens = tokenize("hello world");
    expect(tokens).toEqual([
      { type: "text", value: "hello world" },
      { type: "eof" },
    ]);
  });
});

/* ------------------------- Parser ---------------------------- */
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

  it("parses simple text node", () => {
    const ast = parse(tokenize("Hello"));
    expect(ast).toEqual([{ type: "Text", value: "Hello" }]);
  });

  it("handles empty input safely", () => {
    expect(parse(tokenize(""))).toEqual([]);
  });
});
