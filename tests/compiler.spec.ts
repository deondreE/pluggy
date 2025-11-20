import { describe, it, expect } from "vitest";
import { tokenize } from "../src/compiler/lexer";
import { generate } from "../src/compiler/codegen";
import { optimize } from "../src/compiler/transformer";
import type { Node } from "../src/compiler/parser";
import { parse } from "../src/compiler/parser";

describe("optimizer", () => {
  it("merges adjacent text nodes", () => {
    const ast: Node[] = [
      { type: "Text", value: "Hello" },
      { type: "Text", value: " " },
      { type: "Text", value: "World" },
    ];
    const out = optimize(ast);
    expect(out).toEqual([{ type: "Text", value: "Hello World" }]);
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
    expect(out).toEqual(ast); // structure unchanged
  });
});

describe("code generator", () => {
  it("renders text nodes to string literals", () => {
    const ast: Node[] = [{ type: "Text", value: "hi" }];
    expect(generate(ast)).toBe(JSON.stringify("hi"));
  });

  it("renders expression nodes to wrapped expressions", () => {
    const ast: Node[] = [{ type: "Expression", code: "count + 1" }];
    expect(generate(ast)).toBe("(count + 1)");
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
    const code = generate(ast);
    expect(code).toBe('h("div", {"id":"x"}, "Hello ", (user))');
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

describe("lexer: tokenize", () => {
  it("should produce correct tokens for nested tags and expressions", () => {
    const src = `<div class="map"><h1>{msg}</h1><p>Hello</p></div>`;
    const tokens = tokenize(src);

    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      "tagOpen",
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

    // Check some key values
    expect(tokens[0]).toMatchObject({ type: "tagOpen", name: "div" });
    expect(tokens[3]).toMatchObject({ type: "text", value: "msg" });
    expect(tokens[5]).toMatchObject({ type: "tagClose", name: "h1" });
  });

  it("should handle plain text", () => {
    const tokens = tokenize("hello world");
    expect(tokens).toEqual([
      { type: "text", value: "hello world" },
      { type: "eof" },
    ]);
  });
});

describe("parser: parse", () => {
  it("should build AST for nested structure", () => {
    const tokens = tokenize(`<div><h1>{msg}</h1><p>Hi</p></div>`);
    const ast = parse(tokens);

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

  it("should parse simple text node", () => {
    const tokens = tokenize("Hello");
    const ast = parse(tokens);
    expect(ast).toEqual([{ type: "Text", value: "Hello" }]);
  });

  it("should handle empty input safely", () => {
    const tokens = tokenize("");
    const ast = parse(tokens);
    expect(ast).toEqual([]);
  });
});
