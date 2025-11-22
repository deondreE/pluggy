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

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const len = src.length;
  let i = 0;
  let braceDepth = 0;

  const eat = (n = 1) => (i += n);
  const peek = () => src[i];
  const readWhile = (re: RegExp) => {
    const s = i;
    while (i < len && re.test(src[i]!)) i++;
    return src.slice(s, i);
  };

  while (i < len) {
    const ch = peek();

    /* ---------- { expressions } ---------- */
    if (ch === "{") {
      out.push({ type: "exprOpen" });
      braceDepth++;
      eat();
      continue;
    }
    if (ch === "}" && braceDepth > 0) {
      out.push({ type: "exprClose" });
      braceDepth--;
      eat();
      continue;
    }

    /* ---------- closing tag </div> ---------- */
    if (ch === "<" && src[i + 1] === "/") {
      i += 2;
      const name = readWhile(/[A-Za-z0-9:_-]/);
      if (peek() === ">") eat();
      out.push({ type: "tagClose", name });
      continue;
    }

    /* ---------- opening tag <div> ---------- */
    if (ch === "<" && /[A-Za-z]/.test(src[i + 1] || "")) {
      eat();
      const tag = readWhile(/[A-Za-z0-9:_-]/);
      out.push({ type: "tagOpen", name: tag });

      // Attributes
      while (i < len) {
        const c = peek();
        if (c === ">" || c === "/") break;
        if (/\s/.test(c)) {
          eat();
          continue;
        }

        const attr = readWhile(/[A-Za-z0-9:_-]/);
        if (!attr) {
          eat();
          continue;
        }
        out.push({ type: "attrName", name: attr });

        if (peek() === "=") {
          eat();

          // quoted value "..."
          if (peek() === '"' || peek() === "'") {
            const q = peek();
            eat();
            const s = i;
            while (i < len && peek() !== q) eat();
            const val = src.slice(s, i);
            if (peek() === q) eat();
            out.push({ type: "attrValue", value: val });
            continue;
          }

          // braced value { expr }
          if (peek() === "{") {
            eat();
            let depth = 1;
            const s = i;
            while (i < len && depth > 0) {
              const c2 = peek();
              if (c2 === "{") depth++;
              else if (c2 === "}") {
                depth--;
                if (depth === 0) break;
              }
              eat();
            }
            const inner = src.slice(s, i).trim();
            if (peek() === "}") eat();
            out.push({ type: "attrValue", value: inner });
            continue;
          }

          // bare value
          const bare = readWhile(/[^\s>]/);
          out.push({ type: "attrValue", value: bare });
          continue;
        }

        // bare attr
        out.push({ type: "attrName", name: attr });
      }

      // self-close
      if (peek() === "/") {
        eat();
        if (peek() === ">") eat();
        out.push({ type: "tagClose", name: tag });
        continue;
      }

      if (peek() === ">") eat();
      continue;
    }

    /* ---------- plain text ---------- */
    const s = i;
    while (i < len && !["<", "{", "}"].includes(peek()!)) eat();
    const v = src.slice(s, i);
    if (v) out.push({ type: "text", value: v });
  }

  out.push({ type: "eof" });
  return out;
}
