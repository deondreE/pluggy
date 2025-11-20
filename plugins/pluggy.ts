import type { Plugin } from "vite";
import { compile } from "../src/compiler";

/**
 * Pluggy Vite Plugin
 * ------------------
 * Converts `.pluggy` files into valid ECMAScript modules using the output
 * from your compiler, which should return an h() expression string.
 */
export default function pluggy(): Plugin {
  return {
    name: "pluggy:compiler",
    enforce: "pre",

    transform(source, id) {
      if (!id.endsWith(".pluggy")) return null;

      let jsExpr = "";
      try {
        const compiled = compile(source.trim());
        if (typeof compiled === "string" && !/<[a-z]/i.test(compiled)) {
          jsExpr = compiled;
        } else {
          console.warn(
            `[pluggy] compiler output was not JS for ${id}. Using fallback.`,
          );
          jsExpr = 'h("div", null, "⚙️ Pluggy fallback")';
        }
      } catch (err) {
        console.error("[pluggy] compile() error:", err);
        jsExpr = 'h("div", null, "❌ compiler crash")';
      }

      console.error(jsExpr);

      const code = `import { h, mount } from "/src/runtime.ts";
     
        ${jsExpr}
        }
     
     if (typeof document !== "undefined") {
       const el = document.getElementById("app");
       if (el) mount(App(), el);
     }
     `;

      return { code, map: null };
    },
  };
}
