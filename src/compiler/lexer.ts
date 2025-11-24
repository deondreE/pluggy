export interface Token {
  type:
    | "tagOpen"
    | "tagClose"
    | "attrName"
    | "attrValue"
    | "attrValueExpr"
    | "exprOpen"
    | "exprClose"
    | "text"
    | "eof";
  name?: string;
  value?: string;
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const len = src.length;
  let i = 0;
  let braceDepth = 0;

  const peek = () => src[i];
  const eat = (n = 1) => (i += n);
  const nextIsAlpha = () => /[A-Za-z]/.test(src[i + 1] || "");

  const readWhile = (re: RegExp) => {
    const s = i;
    while (i < len && re.test(src[i]!)) i++;
    return src.slice(s, i);
  };

  while (i < len) {
    const ch = peek();

    /* ----- { ...expression... } blocks in content ----- */
    if (ch === "{") {
      out.push({ type: "exprOpen" });
      braceDepth++;
      eat();
      continue;
    }

    if (ch === "}" && braceDepth > 0) {
      braceDepth--;
      eat();
      out.push({ type: "exprClose" });
      continue;
    }

    /* ----- closing tag: </div> ----- */
    if (ch === "<" && src[i + 1] === "/") {
      i += 2;
      const name = readWhile(/[A-Za-z0-9:_-]/);
      while (i < len && /\s/.test(peek()!)) eat();
      if (peek() === ">") eat();
      out.push({ type: "tagClose", name });
      continue;
    }

    /* ----- opening tag: <div>, <Comp> ----- */
    if (ch === "<" && nextIsAlpha()) {
      eat(); // '<'
      const tag = readWhile(/[A-Za-z0-9:_-]/);
      out.push({ type: "tagOpen", name: tag });
      
      while (i < len) {
        while (i < len && /\s/.test(peek()!)) eat();
        const c = peek();
        if (!c || c === ">" || c === "/") break;

        const attrName = readWhile(/[A-Za-z0-9:_-]/);
        if (!attrName) {
          eat();
          continue;
        }

        let val: string | null = null;

        if (peek() === "=") {
          eat(); // '='

          if (peek() === '"' || peek() === "'") {
            const quote = peek();
            eat();
            const start = i;
            while (i < len && peek() !== quote) eat();
            val = src.slice(start, i);
            if (peek() === quote) eat();
            out.push({ type: "attrName", name: attrName });
            out.push({ type: "attrValue", value: val });
            continue;
          }

          if (peek() === "{") {
            eat(); // '{'
            let depth = 1;
            const start = i;
            while (i < len && depth > 0) {
              const c2 = peek();
              if (c2 === "{") depth++;
              else if (c2 === "}") depth--;
              eat();
            }
            const valExpr = src.slice(start, i - 1).trim();
            out.push({ type: "attrName", name: attrName });
            out.push({ type: "attrValueExpr", value: valExpr });
            if (peek() === "}") eat(); 
            continue;
          }

          // bareword value (e.g. disabled=true)
          const start = i;
          while (i < len && /[^\s>]/.test(peek()!)) eat();
          val = src.slice(start, i);
          out.push({ type: "attrName", name: attrName });
          out.push({ type: "attrValue", value: val });
          continue;
        }

        out.push({ type: "attrName", name: attrName });
      }

      while (i < len && /\s/.test(peek()!)) eat();
      if (peek() === "/") {
        eat();
        if (peek() === ">") eat();
        out.push({ type: "tagClose", name: tag });
        continue;
      }

      if (peek() === ">") eat();
      continue;
    }

    /* ----- text node ----- */
    const start = i;
    while (i < len && !["<", "{", "}"].includes(peek()!)) eat();
    const val = src.slice(start, i);
    if (val) out.push({ type: "text", value: val });
  }

  out.push({ type: "eof" });
  return out;
}