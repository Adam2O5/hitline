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

export function screen(root: HTMLElement, ...children: HTMLElement[]): HTMLDivElement {
  const s = el('div', 'screen');
  s.append(...children);
  root.replaceChildren(s);
  return s;
}
