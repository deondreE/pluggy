import type { Plugin } from "vite";
import { compile } from "../src/compiler";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export default function pluggy(): Plugin {
  const pagesDir = path.resolve(process.cwd(), "src/pages");
  const virtualId = "virtual:pluggy-id";
  const resolvedId = "\0" + virtualId;
  let cache = "";

  return {
    name: "pluggy:compiler",
    enforce: "pre",

    transform(source, id) {
      if (!id.endsWith(".pluggy")) return null;
      const src = source.trim();
      const name = makeName(path.basename(id, ".pluggy"));
      const isComp = /\bexport\s+function\s+[A-Z]/.test(src);
      let js: string;
      try {
        js = compile(src, { wrap: !isComp, name });
      } catch {
        js = `import {h} from './runtime'
export function ${name}(){return h('div',null,'❌ compile error')}
export default ${name}`;
      }
      const out = path.resolve(".pluggy-out");
      if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(
        path.join(out, createHash("md5").update(id).digest("hex") + ".js"),
        js,
      );
      return { code: js, map: null };
    },

    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },

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
        return `{
  path:"${url}",
  component:()=>import("${importPath}"),
  layout:${layout ? `"${layout}"` : "null"},
  server:${server ? `"${server}"` : "null"},
  meta:async()=>{const m=await import("${importPath}");return{title:m.title??null,description:m.description??null}}
}`;
      });
      cache = `export default [${routes.join(",")}]`;
      return cache;
    },

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

function flatFiles(dir: string, out: string[] = []): string[] {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) flatFiles(full, out);
    else if (item.endsWith(".pluggy")) out.push(full);
  }
  return out;
}

function makeName(s: string) {
  const clean = s.replace(/\[|\]/g, "");
  return /^[A-Z]/.test(clean)
    ? clean
    : clean.charAt(0).toUpperCase() + clean.slice(1);
}

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

function findLayout(root: string, abs: string) {
  let dir = path.dirname(abs);
  while (dir.startsWith(root)) {
    const f = path.join(dir, "_layout.pluggy");
    if (fs.existsSync(f)) return path.relative(root, f).replace(/\\/g, "/");
    dir = path.dirname(dir);
  }
  return null;
}

function findServer(root: string, abs: string) {
  let dir = path.dirname(abs);
  while (dir.startsWith(root)) {
    const f = path.join(dir, "+server.ts");
    if (fs.existsSync(f)) return path.relative(root, f).replace(/\\/g, "/");
    dir = path.dirname(dir);
  }
  return null;
}
