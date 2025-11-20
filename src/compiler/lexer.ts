export type Token =
  | { type: "tagOpen"; name: string }
  | { type: "tagClose"; name: string }
  | { type: "attrName"; name: string }
  | { type: "attrValue"; value: string }
  | { type: "text"; value: string }
  | { type: "exprOpen" }
  | { type: "exprClose" }
  | { type: "eof" };

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = src.length;

  const peek = (n = 0) => src[i + n];
  const eat = (n = 1) => (i += n);
  const readWhile = (re: RegExp) => {
    const start = i;
    while (i < len && re.test(src[i])) i++;
    return src.slice(start, i);
  };

  while (i < len) {
    const ch = peek();

    // --------------- Tag open / close ---------------
    if (ch === "<") {
      if (peek(1) === "/") {
        // closing tag
        eat(2);
        const name = readWhile(/[A-Za-z0-9:_-]/);
        if (peek() === ">") eat();
        tokens.push({ type: "tagClose", name });
        continue;
      }

      // opening tag
      eat(); // skip <
      const tagName = readWhile(/[A-Za-z0-9:_-]/);
      tokens.push({ type: "tagOpen", name: tagName });

      // --- attributes
      while (i < len && peek() !== ">" && peek() !== "/") {
        // ignore whitespace between attributes
        if (/\s/.test(peek())) {
          eat();
          continue;
        }

        const attrName = readWhile(/[A-Za-z0-9:_-]/);
        if (!attrName) {
          eat();
          continue;
        }
        tokens.push({ type: "attrName", name: attrName });

        // attribute value
        if (peek() === "=") {
          eat();

          // quoted value
          if (peek() === '"' || peek() === "'") {
            const quote = peek();
            eat();
            const value = readWhile(new RegExp(`[^${quote}]`));
            tokens.push({ type: "attrValue", value });
            if (peek() === quote) eat();
            continue;
          }

          // value in braces {expression}
          if (peek() === "{") {
            tokens.push({ type: "exprOpen" });
            eat();
            const expr = readWhile(/[^}]/);
            tokens.push({ type: "attrValue", value: expr.trim() });
            if (peek() === "}") {
              tokens.push({ type: "exprClose" });
              eat();
            }
            continue;
          }

          // bareword value until space or >
          const value = readWhile(/[^\s>]/);
          tokens.push({ type: "attrValue", value });
          continue;
        }
      }

      // finish tag if >
      if (peek() === ">") eat();
      continue;
    }

    // --------------- Expressions ---------------
    if (ch === "{") {
      tokens.push({ type: "exprOpen" });
      eat();
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "exprClose" });
      eat();
      continue;
    }

    // --------------- Text ---------------
    const text = readWhile(/[^<{}/]/);
    if (text) {
      tokens.push({ type: "text", value: text });
    } else {
      // safety to advance when no match
      eat();
    }
  }

  tokens.push({ type: "eof" });
  return tokens;
}
