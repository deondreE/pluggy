import { tokenize } from "./lexer";
import { parse } from "./parser";
import { optimize } from "./transformer";
import { generate } from "./codegen";

export function compile(template: string): string {
  try {
    const match = /return\s*\(([\s\S]*)\)\s*;?/m.exec(template);
    const jsx = match ? match[1]!.trim() : template.trim();

    const tokens = tokenize(jsx);
    const ast = parse(tokens);
    const opt = optimize(ast);
    const expression = generate(opt);

    const prefix = template.slice(0, match ? match.index : 0);
    const result = `${prefix}\nconst __root = ${expression};\nreturn __root;`;

    return result;
  } catch (err) {
    console.error("[compile] fallback due to error:", err);
    const safe = template.replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
    return `h("pre", null, "${safe}")`; // fallback only on crash
  }
}
