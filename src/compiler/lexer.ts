export type Token =
  | { type: 'tagOpen'; name: string }
  | { type: 'tagClose'; name: string }
  | { type: 'text'; value: string }
  | { type: 'exprOpen' }
  | { type: 'exprClose' }
  | { type: 'eof' };

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = src.length;

  const peek = (n = 0) => src[i + n];
  const eat = (n = 1) => (i += n);

  while (i < len) {
    const ch = peek();

    // ---- Tag open / close ----
    if (ch === '<') {
      if (peek(1) === '/') {
        eat(2);
        const name = readWhile(/[A-Za-z0-9:_-]/);
        if (peek() === '>') eat();
        tokens.push({ type: 'tagClose', name });
        continue;
      }
      eat(); // skip <
      const name = readWhile(/[A-Za-z0-9:_-]/);
      // skip attributes & whitespace
      while (i < len && peek() !== '>') eat();
      if (peek() === '>') eat();
      tokens.push({ type: 'tagOpen', name });
      continue;
    }

    // ---- Expressions ----
    if (ch === '{') {
      tokens.push({ type: 'exprOpen' });
      eat();
      continue;
    }
    if (ch === '}') {
      tokens.push({ type: 'exprClose' });
      eat();
      continue;
    }

    // ---- Text ----
    const text = readWhile(/[^<{}/]/);
    if (text) tokens.push({ type: 'text', value: text });
    else eat(); // safety: consume any stray char
  }

  tokens.push({ type: 'eof' });
  return tokens;

  function readWhile(re: RegExp): string {
    const start = i;
    while (i < len && re.test(src[i]!)) i++;
    return src.slice(start, i);
  }
}
