import { tokenize } from "./lexer";
import { parse } from "./parser";
import { optimize } from "./transformer";
import { generate } from "./codegen";

export interface CompileOptions {
  wrap?: boolean;
  name?: string;
}

/**
 * Pluggy compiler
 * ---------------
 * • Handles several components per file
 * • Supports `return <x>` / `return (<x>)`
 * • Supports arrow‑function components (`const C = () => <div/>`)
 * • Cleans extraneous semicolons
 */
export function compile(
  template: string,
  options: CompileOptions = {},
): string {
  const { wrap = false, name = "App" } = options;

  try {
    // ---------- STEP 1: expand arrow functions ----------
    // Turn: const X = () => <div/>  →  const X = () => { return <div/>; }
    const arrowPattern = /([=]\s*\(\s*\)|=\s*)=>\s*(<[\s\S]*?>)(?=[;\n])/gm;
    template = template.replace(arrowPattern, (_, before, jsx) => {
      return `${before}=> { return ${jsx}; }`;
    });

    // ---------- STEP 2: compile every `return <jsx>` ----------
    let out = "";
    let i = 0;
    const len = template.length;

    while (i < len) {
      const idx = template.indexOf("return", i);
      if (idx === -1) {
        out += template.slice(i);
        break;
      }

      out += template.slice(i, idx);
      i = idx + 6;

      // skip whitespace
      while (i < len && /\s/.test(template[i]!)) i++;

      let jsx = "";

      // return ( <div> ... </div> )
      if (template[i] === "(") {
        let depth = 1;
        i++;
        const start = i;
        while (i < len && depth > 0) {
          const ch = template[i]!;
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
          i++;
        }
        jsx = template.slice(start, i - 1).trim();
      }
      // return <div> ... </div>;
      else if (template[i] === "<") {
        const start = i;
        let depth = 0;
        while (i < len) {
          const ch = template[i]!;
          if (ch === "<" && template[i + 1] !== "/") depth++;
          else if (ch === "<" && template[i + 1] === "/") depth--;
          if (depth <= 0 && ch === ">" && template[i + 1] === ";") {
            i++;
            break;
          }
          i++;
        }
        jsx = template.slice(start, i).trim();
      } else {
        out += "return ";
        continue;
      }

      // --- compile the captured JSX fragment ---
      const tokens = tokenize(jsx);
      const ast = parse(tokens);
      const optimized = optimize(ast);
      const expr = generate(optimized);
      out += `return ${expr};`;
    }

    let output = out;

    // ---------- STEP 3: determine file type ----------
    const isComponentFile =
      /\bexport\s+(function|const|let)\s+[A-Z]/.test(template) ||
      /\bimport\s+[{*]/.test(template);

    // ---------- STEP 4: normalize semicolons ----------
    output = output
      .replace(/;;+/g, ";") // collapse multiples
      .replace(/(return[^;}]+)\}/g, "$1;}") // ensure single ";" before "}"
      .replace(/;(\s*if\s*\()/g, "$1") // remove ";" before footer if
      .trim();

    // ---------- STEP 5: plain template wrapper ----------
    if (!isComponentFile) {
      const tokens = tokenize(template);
      const ast = parse(tokens);
      const optimized = optimize(ast);
      const expr = generate(optimized);
      return wrap ? wrapComponent(expr, name) : expr;
    }

    // ---------- STEP 6: mount footer ----------
    if (!/mountApp\s*\(/.test(output)) {
      const needsDefault = !/\bexport\s+default\s+[A-Z]/.test(output);
      const footer = `
if (typeof document !== "undefined") {
  const el = document.getElementById("app");
  if (el) mountApp(App, el);
}
${needsDefault ? `export default App;` : ""}
`;
      output = output.trimEnd() + "\n" + footer;
    }

    return output;
  } catch (err) {
    console.error("[compile] error:", err);
    const safe = template.replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
    return `h("pre", null, "${safe}")`;
  }
}

// helper for plain templates
function wrapComponent(expr: string, name: string): string {
  const header = `import {
  h,
  mountApp,
  signal,
  effect,
  store,
  computed,
  batch,
  resource,
  transition
} from './runtime';\n`;

  return `${header}
export function ${name}() {
  return ${expr};
}

if (typeof document !== "undefined") {
  const el = document.getElementById("app");
  if (el) mountApp(${name}, el);
}
export default ${name};`;
}
