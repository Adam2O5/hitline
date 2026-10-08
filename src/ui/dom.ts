export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export function button(text: string, onClick: () => void, secondary = false): HTMLButtonElement {
  const b = el('button', secondary ? 'secondary' : '', text);
  b.addEventListener('click', onClick);
  return b;
}

let overlayId = 0;

export function overlay(parent: HTMLElement, ...children: HTMLElement[]): HTMLDivElement {
  const o = el('div', 'overlay');
  o.append(...children);
  o.setAttribute('role', 'dialog');
  o.setAttribute('aria-modal', 'true');
  const title = o.querySelector('h2');
  if (title) {
    title.id = `overlay-title-${++overlayId}`;
    o.setAttribute('aria-labelledby', title.id);
  }
  o.addEventListener('pointerdown', e => e.stopPropagation());
  parent.append(o);
  o.querySelector('button')?.focus();
  return o;
}

export function screen(root: HTMLElement, ...children: HTMLElement[]): HTMLDivElement {
  const s = el('div', 'screen');
  s.append(...children);
  root.replaceChildren(s);
  return s;
}
