export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const len = src.length;
  let i = 0;
  let inExpr = 0; // depth of {...}

  const eat = (n = 1) => (i += n);
  const readWhile = (re: RegExp) => {
    const s = i;
    while (i < len && re.test(src[i]!)) i++;
    return src.slice(s, i);
  };

  while (i < len) {
    const ch = src[i]!;

    /* --------- braces --------- */
    if (ch === "{") {
      out.push({ type: "exprOpen" });
      inExpr++;
      eat();
      continue;
    }
    if (ch === "}" && inExpr > 0) {
      out.push({ type: "exprClose" });
      inExpr--;
      eat();
      continue;
    }

    /* --------- tags (even in expressions) --------- */
    if (ch === "<") {
      const next = src[i + 1];
      // closing tag </...
      if (next === "/") {
        i += 2;
        const name = readWhile(/[A-Za-z0-9:_-]/);
        if (src[i] === ">") i++;
        out.push({ type: "tagClose", name });
        continue;
      }

      // opening tag <x ...>
      if (/[A-Za-z]/.test(next)) {
        i++;
        const tag = readWhile(/[A-Za-z0-9:_-]/);
        out.push({ type: "tagOpen", name: tag });

        // --- attributes ---
        while (i < len) {
          const c = src[i]!;
          if (c === ">" || c === "/") break;
          if (/\s/.test(c)) {
            i++;
            continue;
          }

          const attrName = readWhile(/[A-Za-z0-9:_-]/);
          if (!attrName) {
            i++;
            continue;
          }
          out.push({ type: "attrName", name: attrName });

          if (src[i] === "=") {
            i++;

            // quoted value
            if (src[i] === '"' || src[i] === "'") {
              const quote = src[i];
              i++;
              const s = i;
              while (i < len && src[i] !== quote) i++;
              out.push({ type: "attrValue", value: src.slice(s, i) });
              if (src[i] === quote) i++;
              continue;
            }

            // braced {expr} value
            if (src[i] === "{") {
              out.push({ type: "exprOpen" });
              i++;
              const s = i;
              let depth = 1;
              while (i < len && depth > 0) {
                if (src[i] === "{") depth++;
                else if (src[i] === "}") depth--;
                if (depth > 0) i++;
              }
              const val = src.slice(s, i).trim();
              out.push({ type: "attrValue", value: val });
              if (src[i] === "}") {
                out.push({ type: "exprClose" });
                i++;
              }
              continue;
            }

            // bare token value
            const val = readWhile(/[^\s>]/);
            out.push({ type: "attrValue", value: val });
            continue;
          }

          // bare attribute like "disabled"
          out.push({ type: "attrName", name: attrName });
        }

        // self-closing
        if (src[i] === "/") {
          i++;
          if (src[i] === ">") i++;
          out.push({ type: "tagClose", name: tag });
          continue;
        }

        if (src[i] === ">") i++;
        continue;
      }
    }

    /* --------- text inside expression --------- */
    if (inExpr > 0) {
      const s = i;
      while (i < len && src[i] !== "{" && src[i] !== "}" && src[i] !== "<") i++;
      const v = src.slice(s, i);
      if (v) out.push({ type: "text", value: v });
      continue;
    }

    /* --------- normal plain text --------- */
    const s = i;
    while (i < len) {
      const c = src[i]!;
      if (c === "<" || c === "{" || c === "}") break;
      i++;
    }
    if (i > s) out.push({ type: "text", value: src.slice(s, i) });
  }

  out.push({ type: "eof" });
  return out;
}
