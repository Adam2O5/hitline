import { tween } from './anim.ts';
import { el } from './dom.ts';

const NS = 'http://www.w3.org/2000/svg';
const R = 45;
const C = 2 * Math.PI * R;

function circle(cls: string): SVGCircleElement {
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('class', cls);
  c.setAttribute('cx', '50');
  c.setAttribute('cy', '50');
  c.setAttribute('r', String(R));
  return c;
}

export interface RingOptions {
  label: string;        // do aria-label
  big?: boolean;
  suffix?: string;
  delay?: number;       // ms
}

/** Okrągły wskaźnik: łuk wypełnia się proporcjonalnie do percent (0-100), liczba w środku rośnie razem z nim. */
export function ring(percent: number, opts: RingOptions): HTMLDivElement {
  const box = el('div', opts.big ? 'ring big' : 'ring');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `${opts.label}: ${Math.round(percent)}%`);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const arc = circle('ring-arc');
  arc.setAttribute('stroke-dasharray', String(C));
  svg.append(circle('ring-track'), arc);
  const value = el('span', 'ring-value');
  box.append(svg, value);
  tween(opts.big ? 1400 : 900, opts.delay ?? 0, k => {
    const p = percent * k;
    arc.setAttribute('stroke-dashoffset', String(C * (1 - p / 100)));
    value.textContent = `${Math.round(p)}${opts.suffix ?? ''}`;
  });
  return box;
}