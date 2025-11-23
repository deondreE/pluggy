import { tokenize } from "./lexer";
import { parse } from "./parser";
import { optimize } from "./transformer";
import { generate } from "./codegen";

export interface CompileOptions {
  wrap?: boolean;
  name?: string;
  isPage?: boolean;
}

export function compile(
  template: string,
  options: CompileOptions = {},
): string {
  const { wrap = false } = options;
  let name = (options.name ?? "App")
    .replace(/\[|\]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  try {
    const arrowPattern = /([=]\s*\(\s*\)|=\s*)=>\s*(<[\s\S]*?>)(?=[;\n])/gm;
    template = template.replace(
      arrowPattern,
      (_, b, jsx) => `${b}=>{return${jsx};}`,
    );

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
      while (i < len && /\s/.test(template[i]!)) i++;

      let jsx = "";
      if (template[i] === "(") {
        let d = 1;
        i++;
        const s = i;
        while (i < len && d > 0) {
          const c = template[i]!;
          if (c === "(") d++;
          else if (c === ")") d--;
          i++;
        }
        jsx = template.slice(s, i - 1).trim();
      } else if (template[i] === "<") {
        const s = i;
        let d = 0;
        while (i < len) {
          const c = template[i]!;
          if (c === "<" && template[i + 1] !== "/") d++;
          else if (c === "<" && template[i + 1] === "/") d--;
          if (d <= 0 && c === ">" && template[i + 1] === ";") {
            i++;
            break;
          }
          i++;
        }
        jsx = template.slice(s, i).trim();
      } else {
        out += "return ";
        continue;
      }

      const tokens = tokenize(jsx);
      const ast = parse(tokens);
      const optimized = optimize(ast);
      const expr = generate(optimized);
      out += `return ${expr};`;
    }

    let output = out
      .replace(/;;+/g, ";")
      .replace(/([)])(})/g, "$1;$2")
      .replace(/;(\s*if\s*\()/g, "$1")
      .trim();

    const isComp =
      /\bexport\s+(function|const|let)\s+[A-Z]/.test(template) ||
      /\bimport\s+[{*]/.test(template);

    if (!isComp) {
      const tokens = tokenize(template);
      const ast = parse(tokens);
      const optimized = optimize(ast);
      const expr = generate(optimized);
      return wrap ? wrapComponent(expr, name) : expr;
    }

    if (options.isPage && !/mountApp\s*\(/.test(output)) {
      const match = output.match(/\bexport\s+function\s+([A-Z]\w*)/);
      const comp = match ? match[1] : name;
      const defaultExists = /\bexport\s+default\s+[A-Z]/.test(output);
      const footer = `
if (typeof document!=="undefined"){
  const el=document.getElementById("app")
  if(el)mountApp(${comp},el)
}
${defaultExists ? "" : `export default ${comp};`}
`;
      output = output.trimEnd() + "\n" + footer;
    }

    return output;
  } catch (err) {
    console.error("[compile] error:", err);
    const safe = template.replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
    return `h("pre",null,"${safe}")`;
  }
}

function wrapComponent(expr: string, name: string): string {
  const header = `import{
h,
mountApp,
signal,
effect,
store,
computed,
batch,
resource,
transition
}from'./runtime';\n`;

  return `${header}
export function ${name}(){
  return ${expr};
}
if(typeof document!=="undefined"){
  const el=document.getElementById("app");
  if(el)mountApp(${name},el);
}
export default ${name};`;
}
