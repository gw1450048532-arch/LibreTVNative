// 极简 DOM 帮助函数与 toast

type Attrs = Record<string, string | EventListener | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = v as string;
    } else if (k === 'text') {
      el.textContent = v as string;
    } else if (k === 'html') {
      el.innerHTML = v as string;
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) el.append(c);
  return el;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

let toastTimer = 0;

export function toast(msg: string, ms = 2600): void {
  let box = document.querySelector<HTMLElement>('.toast-box');
  if (!box) {
    box = h('div', { class: 'toast-box' });
    document.body.append(box);
  }
  const item = h('div', { class: 'toast', text: msg });
  box.append(item);
  window.setTimeout(() => item.remove(), ms);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box?.remove(), ms + 400);
}

export function go(path: string): void {
  location.hash = path;
}
