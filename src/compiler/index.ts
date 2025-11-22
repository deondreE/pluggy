import { tokenize } from './lexer';
import { parse } from './parser';
import { optimize } from './transformer';
import { generate } from './codegen';

export interface CompileOptions {
  wrap?: boolean;
  name?: string;
}

/**
 * Compile a Pluggy component or template to pure JS.
 */
export function compile(
  template: string,
  options: CompileOptions = {},
): string {
  const { wrap = false, name = 'App' } = options;

  try {
    const alreadyHasComponent =
      /\bexport\s+function\s+[A-Z]/.test(template) ||
      /\bimport\s+[{*]/.test(template);

    // Split prefix and JSX content (tries to match last return( ... ) occurrence)
    let prefix = '';
    let jsx = template.trim();
    const r = /(return\s*\([\s\S]*\)\s*;?)(?![\s\S]*return)/m.exec(template);
    if (r) {
      prefix = template.slice(0, r.index);
      jsx = /return\s*\(([\s\S]*)\)\s*;?/.exec(template)?.[1]?.trim() ?? '';
    }

    /* ---------- Transform JSX ---------- */
    const tokens = tokenize(jsx);
    const ast = parse(tokens);
    const optimized = optimize(ast);
    const expression = generate(optimized);

    if (alreadyHasComponent) {
      let result = template.replace(
        /return\s*\([\s\S]*\)\s*;?/m,
        `return ${expression};`,
      );

      if (!/mountApp\s*\(/.test(result)) {
        const needsDefaultExport = !/\bexport\s+default\s+[A-Z]/.test(result);
        const footer = `
if (typeof document !== "undefined") {
  const el = document.getElementById("app");
  if (el) mountApp(App, el);
}
${needsDefaultExport ? `export default App;` : ''}
`;
        result = result.trimEnd() + '\n' + footer;
      }

      return result + '\n';
    }

    /* ---------- Plain template mode ---------- */
    if (!wrap) return prefix + '\nreturn ' + expression + ';\n';

    /* ---------- Wrapped component ---------- */
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

    const preamble = `export function ${name}() {
${prefix.trimEnd() ? prefix.trimEnd() + '\n' : ''}
  return ${expression};
}\n`;

    const mountCode = `
if (typeof document !== "undefined") {
  const el = document.getElementById("app");
  if (el) mountApp(${name}, el);
}
export default ${name};
`;

    return header + preamble + mountCode;
  } catch (err) {
    console.error('[compile] error:', err);
    const safe = template.replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
    return `h("pre", null, "${safe}")`;
  }
}
