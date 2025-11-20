// -----------------------------
// Simple DOM‑first runtime
// -----------------------------

export type Props = Record<string, any> | null;
export type Child = HTMLElement | string | number | null | undefined | Child[];

/**
 * h()  →  creates and returns a real HTMLElement tree.
 * Example:
 *   const el = h("div", { class: "box" }, "Hello");
 *   document.body.append(el);
 */
export function h(
  tag: string,
  props: Props,
  ...children: Child[]
): HTMLElement {
  const el = document.createElement(tag);

  // Apply attributes / properties
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('on:') && typeof v === 'function') {
        el.addEventListener(k.slice(3), v as any);
      } else if (k === 'class') {
        el.className = v ?? '';
      } else if (k in el) {
        // @ts-ignore assignable DOM prop
        el[k] = v;
      } else if (v === true) {
        el.setAttribute(k, '');
      } else if (v != null && v !== false) {
        el.setAttribute(k, String(v));
      }
    }
  }

  // Append children (recursively flatten arrays)
  appendChildren(el, children);
  return el;
}

// Recursively mount mixed children
function appendChildren(parent: HTMLElement, kids: Child[]) {
  for (const child of kids) {
    //@ts-ignore
    if (child == null || child === false) continue;

    if (Array.isArray(child)) {
      appendChildren(parent, child);
      continue;
    }

    if (typeof child === 'string' || typeof child === 'number') {
      parent.append(document.createTextNode(String(child)));
      continue;
    }

    if (child instanceof Node) {
      parent.append(child);
      continue;
    }
  }
}

/**
 * Mounts an element (or text) into a root container,
 * replacing any existing content.
 */
export function mount(el: HTMLElement | string, root: HTMLElement) {
  root.textContent = '';
  if (typeof el === 'string') {
    root.textContent = el;
  } else {
    root.append(el);
  }
}

// -----------------------------
// Example signal implementation
// (still optional for reactivity)
// -----------------------------
export function signal<T>(v: T) {
  let val = v;
  const subs = new Set<() => void>();
  return {
    get() {
      return val;
    },
    set(nv: T) {
      if (!Object.is(nv, val)) {
        val = nv;
        for (const f of subs) f();
      }
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
