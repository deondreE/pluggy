// === Type definitions ===

export type Props = Record<string, any> | null;
export type Child =
  | HTMLElement
  | Text
  | string
  | number
  | null
  | undefined
  | Child[];

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
        if (typeof v === "function") el.addEventListener(ev, v);
        continue;
      }

      if (k.startsWith("on")) {
        const ev = k.slice(2).toLowerCase();
        if (typeof v === "function") el.addEventListener(ev, v);
        continue;
      }

      if (
        typeof v === "function" &&
        typeof (v as any).subscribe === "function"
      ) {
        const sig = v as Signal<any>;
        const apply = (val: any) => {
          if (typeof val === "boolean" && k in el) {
            (el as any)[k] = val;
            return;
          }

          if (k === "class") el.className = val ?? "";
          else if (k in el) (el as any)[k] = val;
          else if (val === true) el.setAttribute(k, "");
          else if (val === false) el.removeAttribute(k);
          else el.setAttribute(k, String(val));
        };
        apply(sig());
        sig.subscribe(() => apply(sig()));
        continue;
      }

      if (k === "class") {
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

// === appendChildren(): handles nested nodes + signals ===
function appendChildren(parent: HTMLElement, kids: Child[]): void {
  for (const child of kids) {
    if (child == null || (child as any) === false) continue;

    if (Array.isArray(child)) {
      appendChildren(parent, child);
      continue;
    }

    if (typeof child === "function" && (child as any).subscribe) {
      parent.append(bindText(child as any));
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
  (): T;
  set(v: T): void;
  subscribe(fn: () => void): () => void;
}

export function signal<T>(initial: T): Signal<T> {
  let val = initial;
  const subs = new Set<() => void>();

  const sig = (() => val) as Signal<T>;

  sig.set = (next: T) => {
    if (!Object.is(next, val)) {
      val = next;
      queueMicrotask(() => subs.forEach((f) => f()));
    }
  };

  sig.subscribe = (fn: () => void) => {
    subs.add(fn);
    return () => subs.delete(fn);
  };

  return sig;
}

export function mountApp(app: () => HTMLElement, root: HTMLElement): void {
  root.textContent = "";
  root.append(app());
}

export function bindText(sig: Signal<any>): Text {
  if (typeof sig !== "function" || typeof sig.subscribe !== "function") {
    return document.createTextNode(String(sig));
  }

  const getVal =
    typeof sig === "function" ? (sig as () => any) : () => (sig as any).get();

  const node = document.createTextNode(String(getVal()));

  sig.subscribe(() => {
    const newVal = String(getVal());
    if (node.nodeValue !== newVal) node.nodeValue = newVal;
  });

  return node;
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
