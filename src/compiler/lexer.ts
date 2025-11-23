export interface Token {
  type:
    | "tagOpen"
    | "tagClose"
    | "attrName"
    | "attrValue"
    | "exprOpen"
    | "exprClose"
    | "text"
    | "eof";
  name?: string;
  value?: string;
}

/**
 * Robust JSX‑like tokenizer for Pluggy.
 * ✔ Handles nested {expr}, self‑closing tags, quoted or bare attributes
 * ✔ Correctly tokenizes boolean attrs and avoids duplicates
 */
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

    /* ----- { curly expressions } ----- */
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

    /* ----- closing tag </div> ----- */
    if (ch === "<" && src[i + 1] === "/") {
      i += 2;
      const name = readWhile(/[A-Za-z0-9:_-]/);
      while (i < len && /\s/.test(peek()!)) eat();
      if (peek() === ">") eat();
      out.push({ type: "tagClose", name });
      continue;
    }

    /* ----- opening tag <div> / <Comp> ----- */
    if (ch === "<" && nextIsAlpha()) {
      eat(); // eat '<'
      const tag = readWhile(/[A-Za-z0-9:_-]/);
      out.push({ type: "tagOpen", name: tag });

      // parse attributes (until > or />)
      while (i < len) {
        // skip whitespace
        while (i < len && /\s/.test(peek()!)) eat();
        const c = peek();
        if (!c || c === ">" || c === "/") break;

        const attrName = readWhile(/[A-Za-z0-9:_-]/);
        if (!attrName) {
          eat();
          continue;
        }

        let val: string | null = null;

        // assignment
        if (peek() === "=") {
          eat(); // '='

          // quoted value
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

          // braced expression value
          if (peek() === "{") {
            eat(); // eat '{'
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
            out.push({ type: "attrValue", value: valExpr });
            if (peek() === "}") eat(); // consume closing brace
            continue;
          }

          // bareword
          const start = i;
          while (i < len && /[^\s>]/.test(peek()!)) eat();
          val = src.slice(start, i);
          out.push({ type: "attrName", name: attrName });
          out.push({ type: "attrValue", value: val });
          continue;
        }

        // boolean attribute (no value)
        out.push({ type: "attrName", name: attrName });
      }

      // self‑closing tag
      while (i < len && /\s/.test(peek()!)) eat();
      if (peek() === "/") {
        eat();
        if (peek() === ">") eat();
        // emit closing mirror for self‑closing
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
