import type { SessionState } from '../engine/session.ts';
import type { Grade } from '../engine/types.ts';
import { button, el, screen } from './dom.ts';

export function showStart(root: HTMLElement, onStart: () => void): void {
  const s = screen(root, el('h1', '', 'Hitline'), el('p', '', 'Dotknij, aby zacząć'));
  s.classList.add('clickable');
  s.addEventListener('click', onStart, { once: true });
}

export function showRound(root: HTMLElement): { area: HTMLDivElement; canvas: HTMLCanvasElement } {
  const area = el('div', 'game');
  const canvas = el('canvas');
  area.append(canvas);
  root.replaceChildren(area);
  return { area, canvas };
}

export function showRoundResults(
  root: HTMLElement,
  s: Readonly<SessionState>,
  actions: { onRetry: () => void; onCalibrate: () => void },
): void {
  const counts: Record<Grade, number> = { perfect: 0, good: 0, ok: 0, miss: 0 };
  for (const n of s.results[s.roundIndex]) counts[n.grade ?? 'miss']++;
  const list = el('ul', 'stats');
  for (const g of ['perfect', 'good', 'ok', 'miss'] as const) list.append(el('li', '', `${g}: ${counts[g]}`));
  list.append(el('li', '', `puste kliknięcia: ${s.emptyTaps[s.roundIndex]}`));

  screen(
    root,
    el('h2', '', `Runda ${s.roundIndex + 1}: ${s.perRound[s.roundIndex]} pkt`),
    list,
    button('Zagraj ponownie', actions.onRetry),
    button('Kalibracja', actions.onCalibrate, true),
  );
}
