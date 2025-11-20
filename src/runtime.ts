export type Props = Record<string, any> | null;
export type Child = HTMLElement | string | number | null | undefined | Child[];

export function h(
  tag: string,
  props: Props,
  ...children: Child[]
): HTMLElement {
  const el = document.createElement(tag);

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("on:")) {
        const ev = k.slice(3);
        if (typeof v === "function") {
          el.addEventListener(ev, v as any);
        } else if (
          typeof v === "string" &&
          (el as any)[v] instanceof Function
        ) {
          el.addEventListener(ev, (el as any)[v].bind(el));
        }
      } else if (k === "class") {
        el.className = v ?? "";
      } else if (k in el) {
        (el as any)[k] = v;
      } else if (v === true) {
        el.setAttribute(k, "");
      } else if (v != null && v !== false) {
        el.setAttribute(k, String(v));
      }
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(parent: HTMLElement, kids: Child[]): void {
  for (const child of kids) {
    if (child == null || (child as any) === false) continue;
    if (Array.isArray(child)) {
      appendChildren(parent, child);
      continue;
    }
    if (typeof child === "string" || typeof child === "number") {
      parent.append(document.createTextNode(String(child)));
      continue;
    }
    if (child instanceof Node) parent.append(child);
  }
}

export function mount(el: HTMLElement | string, root: HTMLElement): void {
  root.textContent = "";
  if (typeof el === "string") root.textContent = el;
  else root.append(el);
}

export interface Signal<T> {
  get(): T;
  set(v: T): void;
  subscribe(fn: () => void): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  let val = initial;
  const subs = new Set<() => void>();
  return {
    get() {
      return val;
    },
    set(nv: T) {
      if (!Object.is(nv, val)) {
        val = nv;
        queueMicrotask(() => subs.forEach((fn) => fn()));
      }
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

let currentRender: (() => HTMLElement) | null = null;
let currentRoot: HTMLElement | null = null;

export function mountApp(app: () => HTMLElement, root: HTMLElement): void {
  currentRender = app;
  currentRoot = root;
  root.textContent = "";
  root.append(app());
}

export function rerender(): void {
  if (!currentRender || !currentRoot) return;
  const newTree = currentRender();
  shallowReplace(currentRoot.firstChild!, newTree);
}

export function createSignal<T>(initial: T): Signal<T> {
  // const s = signal(initial);
  // s.subscribe(() => rerender());
  // return s;
  return signal(initial);
}

function shallowReplace(oldNode: Node, newNode: Node) {
  if (
    oldNode.nodeType !== newNode.nodeType ||
    oldNode.nodeName !== newNode.nodeName
  ) {
    oldNode.replaceWith(newNode);
    return;
  }
  if (oldNode instanceof Text && newNode instanceof Text) {
    if (oldNode.nodeValue !== newNode.nodeValue)
      oldNode.nodeValue = newNode.nodeValue;
    return;
  }
  const oldChildren = Array.from(oldNode.childNodes);
  const newChildren = Array.from(newNode.childNodes);
  const len = Math.max(oldChildren.length, newChildren.length);
  for (let i = 0; i < len; i++) {
    const oldChild = oldChildren[i];
    const newChild = newChildren[i];
    if (!oldChild) oldNode.appendChild(newChild!);
    else if (!newChild) oldChild.remove();
    else shallowReplace(oldChild, newChild);
  }
}

export function bindText(sig: Signal<any>): Text {
  const node = document.createTextNode(String(sig.get()));
  sig.subscribe(() => (node.nodeValue = String(sig.get())));
  return node;
}
