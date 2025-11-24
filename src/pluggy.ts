import type { Plugin } from "vite";
import { compile } from "./compiler";
import {
  extractPluggyImports,
  stripPluggyImports,
  stripCssImports,
} from "../src/compiler/utils";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Vite plugin: Pluggy compiler
 * ---------------------------------------
 *  - Compiles `.pluggy` templates into JS modules
 *  - Recursively inlines imported `.pluggy` components
 *  - Builds virtual route definitions from /src/pages
 *  - Supports hot reload for rapid development
 */
export default function pluggy(): Plugin {
  const pagesDir = path.resolve(process.cwd(), "src/pages");
  const virtualId = "virtual:pluggy-id";
  const resolvedId = "\0" + virtualId;
  let cache = "";

  return {
    name: "pluggy:compiler",
    enforce: "pre",

    /**
     * Compile each `.pluggy` file encountered by Vite.
     * For pages, recursively inline all referenced components.
     */
    transform(source, id) {
      if (!id.endsWith(".pluggy")) return null;

      const src = source.trim();
      const isPage = id.includes("/pages/");
      const name = makeName(path.basename(id, ".pluggy"));
      const isComp = /\bexport\s+function\s+[A-Z]/.test(src);

      const pluggyImports = extractPluggyImports(src);

      // Clean up pluggy + CSS imports before compiling
      const cleaned = stripCssImports(stripPluggyImports(source));

      let js: string;
      try {
        js = compile(cleaned.trim(), { wrap: !isComp, name, isPage });

        if (isPage && pluggyImports.length) {
          let combined = "";
          for (const imp of pluggyImports) {
            const abs = path.resolve(path.dirname(id), imp);
            const code = fs.readFileSync(abs, "utf-8");
            const compName = makeName(path.basename(abs, ".pluggy"));

            const compJs = compile(stripCssImports(stripPluggyImports(code)), {
              wrap: false,
              name: compName,
              isPage: false,
            });

            combined += `\n// inlined: ${imp}\n${compJs}\n`;
          }
          js = combined + "\n" + js;
        }
      } catch (err) {
        console.error("[pluggy] compile error:", err);
        js = `import { h } from './runtime';
export function ${name}(){
  return h('div',null,'❌ compile error')
}
export default ${name};`;
      }

      const out = path.resolve(".pluggy-out");
      if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(
        path.join(out, createHash("md5").update(id).digest("hex") + ".js"),
        js
      );

      return { code: js, map: null };
    },

    /**
     * Allow Vite to handle normal resolution of `.pluggy` imports
     * (we intercept and compile them in `transform()`).
     */
    resolveId(id) {
      if (id.endsWith(".pluggy")) return null;
      if (id === virtualId) return resolvedId;
    },

    /**
     * Virtual module `virtual:pluggy-id`
     * → produces dynamic route definitions for `/src/pages`
     */
    load(id) {
      if (id !== resolvedId) return null;
      if (cache) return cache;
      if (!fs.existsSync(pagesDir)) return (cache = "export default []");

      const files = flatFiles(pagesDir);
      const routes = files.map((abs) => {
        const rel = path.relative(pagesDir, abs).replace(/\\/g, "/");
        const url = makeUrl(rel);
        const layout = findLayout(pagesDir, abs);
        const server = findServer(pagesDir, abs);
        const importPath = "/src/pages/" + rel;
        const css = extractCssImports(fs.readFileSync(abs, "utf-8"), abs);

        return `{
  path:"${url}",
  styles: ${JSON.stringify(css)},
  component:()=>import("${importPath}"),
  layout:${layout ? `"${layout}"` : "null"},
  server:${server ? `"${server}"` : "null"},
  meta:async()=>{const m=await import("${importPath}");
    return{title:m.title??null,description:m.description??null}}
}`;
      });

      cache = `export default [${routes.join(",")}]`;
      return cache;
    },

    /**
     * Hot reload handler:
     *  - Clears route cache
     *  - Invalidates the virtual module
     *  - Requests full browser reload
     */
    handleHotUpdate(ctx) {
      if (!ctx.file.endsWith(".pluggy")) return;
      cache = "";
      const mod = ctx.server.moduleGraph.getModuleById(resolvedId);
      if (mod) ctx.server.moduleGraph.invalidateModule(mod);
      ctx.server.ws.send({ type: "full-reload" });
      console.log("[pluggy] routes regenerated");
    },
  };
}

/** Collect all page files recursively under a directory */
function flatFiles(dir: string, out: string[] = []): string[] {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) flatFiles(full, out);
    else if (item.endsWith(".pluggy")) out.push(full);
  }
  return out;
}

/** PascalCase name generation from filename */
function makeName(s: string) {
  const clean = s.replace(/\[|\]/g, "");
  return /^[A-Z]/.test(clean)
    ? clean
    : clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** URL path inference from file path */
function makeUrl(rel: string) {
  const base = path.basename(rel, ".pluggy").toLowerCase();
  if (base === "app") return "/";
  const url =
    "/" +
    rel
      .replace(/\/index\.pluggy$/, "")
      .replace(/\.pluggy$/, "")
      .replace(/\[([^\]]+)\]/g, ":$1");
  return url.replace(/\/+/g, "/");
}

/** Walk upward to find nearest `_layout.pluggy` file */
function findLayout(root: string, abs: string) {
  let dir = path.dirname(abs);
  while (dir.startsWith(root)) {
    const f = path.join(dir, "_layout.pluggy");
    if (fs.existsSync(f)) return path.relative(root, f).replace(/\\/g, "/");
    dir = path.dirname(dir);
  }
  return null;
}

/** Walk upward to find nearest `+server.ts` endpoint file */
function findServer(root: string, abs: string) {
  let dir = path.dirname(abs);
  while (dir.startsWith(root)) {
    const f = path.join(dir, "+server.ts");
    if (fs.existsSync(f)) return path.relative(root, f).replace(/\\/g, "/");
    dir = path.dirname(dir);
  }
  return null;
}

function extractCssImports(src: string, id: string) {
  const cssRegex =
    /\s*import\s+(?:[^'"]+\s+from\s+)?["']([^"']+\.(?:css|scss|sass|less|postcss))["']\s*;?/g;

  const matches = [...src.matchAll(cssRegex)];
  return matches.map((m) =>
    path
      .relative(process.cwd(), path.resolve(path.dirname(id), m[1]!))
      .replace(/\\/g, "/")
  );
}
