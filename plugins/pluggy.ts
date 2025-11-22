import type { Plugin } from 'vite';
import { compile } from '../src/compiler';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

/**
 * Pluggy Vite Plugin
 * ------------------
 * Converts `.pluggy` files into JS modules.
 * Detects whether they are complete components or view fragments
 * and compiles appropriately.
 */
export default function pluggy(): Plugin {
  return {
    name: 'pluggy:compiler',
    enforce: 'pre',

    async transform(source, id) {
      if (!id.endsWith('.pluggy')) return null;

      const src = source.trim();
      const hash = createHash('sha1').update(src).digest('hex');

      // derive component name from file name
      const rawName = basename(id).replace(/\.pluggy$/, '');
      const name = /^[A-Z]/.test(rawName)
        ? rawName
        : rawName.charAt(0).toUpperCase() + rawName.slice(1);

      // detect if this file already contains component logic
      const isFullComponent =
        /\bexport\s+function\s+[A-Z]/.test(src) || /\bimport\s+[{*]/.test(src);

      let js = '';

      try {
        // ----- compile based on file type -----
        const opts = { wrap: !isFullComponent, name };
        js = compile(src, opts);

        // ----- sanity check (only for wrapped output) -----
        if (!isFullComponent) {
          if (
            !/^import\s+\{/.test(js) ||
            !js.includes(`export function ${name}`)
          ) {
            throw new Error(
              `[pluggy:compiler] Invalid compile output for ${id}\n` +
                'Expected full wrapped file output but got:\n' +
                js.slice(0, 500),
            );
          }
        }

        // ----- developer log -----
        const tag = isFullComponent ? 'component' : 'template';
        const relativePath = relative(process.cwd(), id);
        console.info(
          `🔧 [pluggy] compiled ${relativePath} → (${tag}, hash=${hash.slice(
            0,
            8,
          )})`,
        );
      } catch (err) {
        console.error('[pluggy] compile() failed:', err);
        js = `import { h } from './runtime';\nexport function ${name}() {
  return h("div", null, "❌ compile crash");
}\nexport default ${name};`;
      }

      // ----- write debug artifact .pluggy-out -----
      try {
        const outDir = resolve(process.cwd(), '.pluggy-out');
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        const rel = relative(process.cwd(), id)
          .replace(/[\\/]/g, '_')
          .replace(/\.pluggy$/, '');
        const outFile = resolve(outDir, rel + '.js');
        writeFileSync(
          outFile,
          `// compiled from: ${id}\n// hash: ${hash}\n\n${js}\n`,
          'utf8',
        );
      } catch (fsErr) {
        console.warn('[pluggy] failed to write compiled output:', fsErr);
      }

      return { code: js, map: null };
    },
  };
}
