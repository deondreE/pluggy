import {
  signal,
  computed,
  batch,
  effect,
  resource,
  store,
  type Signal,
} from "./signals";

export type Props = Record<string, any> | null;
export type Child =
  | HTMLElement
  | Text
  | string
  | number
  | null
  | undefined
  | Child[];

export function h(tag: any, props: Props, ...children: Child[]): HTMLElement {
  if (typeof tag === "function") {
    const merged = props ? { ...props } : {};
    merged.children = children.flat();
    const out = tag(merged);
    if (out instanceof Node) return out;
    if (typeof out === "string") {
      const span = document.createElement("span");
      span.textContent = out;
      return span;
    }
    return document.createComment("invalid component return");
  }

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
      if (k === "class") el.className = v ?? "";
      else if (k in el) (el as any)[k] = v;
      else if (v === true) el.setAttribute(k, "");
      else if (v != null && v !== false) el.setAttribute(k, String(v));
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

export function bindText(sig: Signal<any>): Text {
  if (typeof sig !== "function" || typeof sig.subscribe !== "function")
    return document.createTextNode(String(sig));
  const node = document.createTextNode(String(sig()));
  sig.subscribe(() => (node.nodeValue = String(sig())));
  return node;
}

export const path = signal(window.location.pathname);
window.addEventListener("popstate", () => path.set(location.pathname));

export function navigate(to: string) {
  if (window.location.pathname === to) return;
  history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function mountApp(app: () => HTMLElement, root: HTMLElement) {
  root.textContent = "";
  root.append(app());
}

export function createApp({ routes }: { routes: any[] }) {
  const currentPath = path;
  const paramsSig = signal<Record<string, string>>({});
  let lastKey = "";
  const cache = new Map<string, any>();

  function matchRoute(url: string) {
    let out = cache.get(url);
    if (out) return out;
    for (const r of routes) {
      const keys: string[] = [];
      const re = new RegExp(
        "^" +
          r.path
            .replace(/:([^/]+)/g, (_, k) => {
              keys.push(k);
              return "([^/]+)";
            })
            .replace(/\//g, "\\/") +
          "$",
      );
      const m = url.match(re);
      if (m) {
        const p: Record<string, string> = {};
        for (let j = 0; j < keys.length; j++)
          p[keys[j]] = decodeURIComponent(m[j + 1]!);
        out = { ...r, params: p };
        cache.set(url, out);
        return out;
      }
    }
    return null;
  }

  function RouterView(): HTMLElement {
    const el = document.createElement("div");
    effect(() => {
      const url = currentPath();
      const route = matchRoute(url);
      if (!route) {
        el.textContent = "404";
        return;
      }
      const key = route.path + JSON.stringify(route.params);
      if (key === lastKey) {
        paramsSig.set(route.params);
        return;
      }
      lastKey = key;
      paramsSig.set(route.params);
      route
        .component()
        .then((mod: any) => {
          let Comp = mod.default;
          if (typeof Comp !== "function") {
            for (const k in mod)
              if (typeof (mod as any)[k] === "function") {
                Comp = (mod as any)[k];
                break;
              }
          }
          if (typeof Comp !== "function") {
            el.textContent = "⚠️ bad export";
            return;
          }
          const vnode = Comp({ params: route.params || {} });
          const node =
            vnode instanceof Node
              ? vnode
              : document.createTextNode(String(vnode));
          el.replaceChildren(node);
        })
        .catch(() => (el.textContent = "⚠️ load fail"));
    });
    return el;
  }

  function mount(sel: string | HTMLElement) {
    const root =
      typeof sel === "string"
        ? (document.querySelector(sel) as HTMLElement)
        : sel;
    if (!root) return;
    root.textContent = "";
    root.append(h("main", null, RouterView()));
  }

  return { mount, navigate, currentPath, params: paramsSig };
}
