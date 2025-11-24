export interface Signal<T> {
  (): T;
  set(v: T): void;
  subscribe(fn: () => void): () => void;
}

let running: (() => void) | null = null;
const contextStack: Record<ContextKey, any>[] = [];
let isBatching = false;
const pending = new Set<() => void>();
let activeComputed: (() => void) | null = null;
let activeWatch: (() => void) | null = null;

type ContextKey = symbol | string;

export function signal<T>(initial: T): Signal<T> {
  let val = initial;
  const subs = new Set<() => void>();

  const sig = (() => {
    if (running) subs.add(running);
    if (activeComputed) subs.add(activeComputed);
    if (activeWatch) subs.add(activeWatch);
    return val;
  }) as Signal<T>;

  sig.set = (next: T) => {
    if (!Object.is(next, val)) {
      val = next;
      const runAll = () => subs.forEach((fn) => fn());
      if (isBatching) pending.add(runAll);
      else runAll();
    }
  };

  sig.subscribe = (fn: () => void) => {
    subs.add(fn);
    return () => subs.delete(fn);
  };
  return sig;
}

export function effect(fn: () => void): () => void {
  const run = () => {
    const prev = activeWatch;
    activeWatch = run;
    fn();
    activeWatch = prev;
  };
  run();
  return () => (activeWatch = null);
}

export function computed<T>(calc: () => T): Signal<T> {
  const out = signal(calc());
  const rerun = () => out.set(calc());
  const prev = activeComputed;
  activeComputed = rerun;
  calc();
  activeComputed = prev;
  return out;
}

export function batch(fn: () => void) {
  const wasBatching = isBatching;
  isBatching = true;
  try {
    fn();
  } finally {
    isBatching = wasBatching;
    if (!isBatching) {
      const tasks = Array.from(pending);
      pending.clear();
      for (const f of tasks) f();
    }
  }
}

export function resource<T>(loader: () => Promise<T>): Signal<T | null> {
  const data = signal<T | null>(null);
  loader().then((r) => data.set(r));
  return data;
}

export function store<T extends object>(obj: T): T {
  const s = signal(structuredClone(obj));
  const proxy = new Proxy(obj, {
    get(_, k) {
      const v = s()[k as keyof T];
      return typeof v === "object" ? store(v as any) : v;
    },
    set(_, k, v) {
      const copy = { ...s() };
      (copy as any)[k] = v;
      s.set(copy);
      return true;
    },
  });
  return proxy as T;
}
/**
 * Render a reactive array signal() into DOM nodes.
 * @param list   A Signal containing an array of data.
 * @param render Function that receives a signal for each item and its index.
 * @returns An array of text/elements you can insert as child.
 */
export function each<T extends { id?: string | number }>(
  list: Signal<T[]>,
  render: (item: Signal<T>, index: Signal<number>) => HTMLElement | Text,
): Node[] {
  const lookup = new Map<
    string | number,
    { sig: Signal<T>; idx: Signal<number>; node: Node }
  >();

  // Create initial nodes
  const initial = list();
  const nodes: Node[] = [];
  for (let i = 0; i < initial.length; i++) {
    const item = signal(initial[i]!);
    const idx = signal(i);
    const node = render(item, idx);
    lookup.set(initial[i]!.id ?? i, { sig: item, idx, node });
    nodes.push(node);
  }

  // Anchor comment ensures stable insertion point for later updates
  const marker = document.createComment("each-marker");
  nodes.push(marker);

  // Reactive update effect
  effect(() => {
    const arr = list() || [];
    const used = new Set<string | number>();
    const parent = marker.parentNode;
    if (!parent) return;

    // Update or add items
    for (let i = 0; i < arr.length; i++) {
      const val = arr[i]!;
      const key = val.id ?? i;
      used.add(key);

      let rec = lookup.get(key);
      if (!rec) {
        const sig = signal(val);
        const idx = signal(i);
        const node = render(sig, idx);
        rec = { sig, idx, node };
        lookup.set(key, rec);
        parent.insertBefore(node, marker);
      } else {
        rec.sig.set(val);
        rec.idx.set(i);
      }
    }

    // Remove missing nodes
    for (const [key, rec] of lookup) {
      if (!used.has(key)) {
        if (rec.node.parentNode) rec.node.remove();
        lookup.delete(key);
      }
    }
  });

  return nodes;
}

export function eachKeyed<T extends { id: string | number }>(
  list: Signal<T[]>,
  render: (item: Signal<T>, index: Signal<number>) => HTMLElement | Text,
): HTMLElement[] {
  const currentMap = new Map<
    string | number,
    { node: Node; item: Signal<T>; index: Signal<number> }
  >();
  const output: Node[] = [];

  effect(() => {
    const nextList = list() || [];
    const visited = new Set<string | number>();

    for (let i = 0; i < nextList.length; i++) {
      const it = nextList[i]!;
      const key = (it as any).id;
      visited.add(key);
      let r = currentMap.get(key);
      if (!r) {
        const sig = signal(it);
        const idxSig = signal(i);
        const node = render(sig, idxSig);
        r = { node, item: sig, index: idxSig };
        currentMap.set(key, r);
      } else {
        r.item.set(it);
        r.index.set(i);
      }
      output[i] = r.node;
    }

    // remove old ones that disappeared
    for (const [k, entry] of currentMap) {
      if (!visited.has(k)) {
        entry.node.remove();
        currentMap.delete(k);
      }
    }

    output.forEach((node) => {
      if (!node.parentNode) document.body.append(node);
    });
  });

  return output as HTMLElement[];
}

/**
 * Provide a context for decendants.
 * Use inside compnents (usually wrapped in <Provider> function components).
 */
export function provide<T>(key: ContextKey, value: T) {
  if (contextStack.length === 0) contextStack.push({});
  contextStack[contextStack.length - 1]![key] = value;
}

/**
 * Consume a context value from the nearest ancestor provider.
 */
export function useContext<T>(key: ContextKey): T | undefined {
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const found = contextStack[i];
    if (key in found!) return found![key];
  }
  return undefined;
}

/**
 * Helper to run a render function with temporary context values.
 * Example: withProvider(Context, value, () => <Child/>)
 */
export function withProvider<T>(
  key: ContextKey,
  value: T,
  render: () => HTMLElement | string,
): HTMLElement | string {
  contextStack.push({ [key]: value });
  const el = render();
  contextStack.pop();
  return el;
}

export interface TransitionStyles {
  opacity?: string;
  transform?: string;
  visibility?: string;
}

export interface TransitionStep {
  from?: TransitionStyles;
  to?: TransitionStyles;
  duration?: number;
  easing?: string;
}

export interface TransitionOptions {
  show: TransitionStep;
  hide: TransitionStep;
  hidden?: TransitionStyles;
}

export const presets: Record<string, TransitionOptions> = {
  fade: {
    show: {
      from: { opacity: "0" },
      to: { opacity: "1" },
      duration: 250,
      easing: "ease",
    },
    hide: {
      from: { opacity: "1" },
      to: { opacity: "0", visibility: "hidden" },
      duration: 250,
      easing: "ease",
    },
  },
  slide: {
    show: {
      from: { transform: "translateY(10px)", opacity: "0" },
      to: { transform: "translateY(0)", opacity: "1" },
    },
    hide: {
      from: { transform: "translateY(0)", opacity: "1" },
      to: { transform: "translateY(-10px)", opacity: "0" },
    },
  },
  scale: {
    show: {
      from: { transform: "scale(0.8)", opacity: "0" },
      to: { transform: "scale(1)", opacity: "1" },
    },
    hide: {
      from: { transform: "scale(1)", opacity: "1" },
      to: { transform: "scale(0.8)", opacity: "0" },
    },
  },
};

/**
 * Generic transition controller.
 * @param el - Element to animation
 * @param active - Reactive signal controlling visibility.
 * @param options - Transition type or custom definition.
 *
 */
export function transition(
  el: HTMLElement,
  active: Signal<boolean>,
  options: TransitionOptions | keyof typeof presets = "fade",
): void {
  const config =
    typeof options === "string" ? presets[options] : (options ?? presets.fade);

  if (!active()) {
    applyStyles(el, config?.hidden);
  }

  effect(() => {
    if (active()) runTransition(el, config!.show);
    else runTransition(el, config!.hide);
  });
}

function runTransition(el: HTMLElement, step: TransitionStep) {
  const { from, to, duration = 250, easing = "ease" } = step;
  if (!to) return;

  el.style.transition = "none";
  if (from) applyStyles(el, from);

  // trigger layout to flush the style changes
  el.getBoundingClientRect();
  el.style.transition = `all ${duration}ms ${easing}`;
  applyStyles(el, to);
}

function applyStyles(el: HTMLElement, styles?: TransitionStyles) {
  if (!styles) return;
  for (const [k, v] of Object.entries(styles)) {
    (el.style as any)[k] = v!;
  }
}
