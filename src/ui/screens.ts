import { roundDuration, type Chart } from '../engine/chart.ts';
import type { SessionState } from '../engine/session.ts';
import type { Grade, InstrumentId } from '../engine/types.ts';
import type { LeaderboardRow, SendResult } from '../net/api.ts';
import { button, el, overlay, screen } from './dom.ts';

const INSTRUMENT_NAMES: Record<InstrumentId, string> = {
  kick808: 'kick',
  snare: 'snare',
  clap: 'clap',
  hat: 'hi-hat',
  openhat: 'open hi-hat',
  bass808: 'bas 808',
  string: 'smyczki',
  perc: 'perkusjonalia',
};

export function instrumentsOf(chart: Chart, roundIndex: number): string {
  const ids = [...new Set(chart.rounds[roundIndex].play.map(n => n.i))];
  return ids.map(i => INSTRUMENT_NAMES[i]).join(', ');
}

export function showStart(root: HTMLElement, onStart: () => void): void {
  const s = screen(root, el('h1', '', 'Hitline'), el('p', '', 'Dotknij, aby zacząć'));
  s.classList.add('clickable');
  s.addEventListener('click', onStart, { once: true });
}

export function showMenu(
  root: HTMLElement,
  charts: Chart[],
  best: (chartId: string) => number | null,
  actions: { onPick: (chart: Chart) => void; onCalibrate: () => void; onRanking: () => void },
): void {
  const list = el('div', 'menu-list');
  for (const c of charts) {
    const b = best(c.id);
    list.append(button(`${c.title} · ${c.bpm} BPM${b !== null ? ` · rekord ${b}` : ''}`, () => actions.onPick(c)));
  }
  if (!charts.length) list.append(el('p', 'warn', 'Brak dostępnych map.'));
  screen(
    root,
    el('h1', '', 'Hitline'),
    list,
    button('Ranking', actions.onRanking, true),
    button('Kalibracja', actions.onCalibrate, true),
  );
}

function rankingList(rows: LeaderboardRow[]): HTMLElement {
  if (!rows.length) return el('p', 'hint', 'Brak wyników. Bądź pierwszy!');
  const list = el('ol', 'ranking');
  for (const r of rows) {
    const li = el('li');
    li.append(el('span', '', r.player), el('span', '', String(r.score)));
    list.append(li);
  }
  return list;
}

function fillRanking(box: HTMLElement, rows: Promise<LeaderboardRow[] | null>): void {
  box.replaceChildren(el('p', 'hint', 'Wczytywanie rankingu…'));
  void rows.then(r => {
    box.replaceChildren(r ? rankingList(r) : el('p', 'hint', 'Ranking jest chwilowo niedostępny.'));
  });
}

export function showMapCard(
  root: HTMLElement,
  chart: Chart,
  best: number | null,
  top: Promise<LeaderboardRow[] | null>,
  actions: { onPlay: () => void; onBack: () => void },
): void {
  const box = el('div', 'ranking-box');
  fillRanking(box, top.then(r => r && r.slice(0, 3)));
  screen(
    root,
    el('h2', '', chart.title),
    el('p', '', `${chart.bpm} BPM · 5 rund po ${Math.round(roundDuration(chart))} s`),
    el('p', 'hint', best !== null ? `Twój rekord: ${best}` : 'Jeszcze nie grałeś tej mapy.'),
    box,
    button('Graj', actions.onPlay),
    button('Wróć', actions.onBack, true),
  );
}

export function showLeaderboard(
  root: HTMLElement,
  charts: Chart[],
  selected: Chart,
  load: (chartId: string) => Promise<LeaderboardRow[] | null>,
  onBack: () => void,
): void {
  const select = el('select');
  for (const c of charts) {
    const o = el('option', '', c.title);
    o.value = c.id;
    o.selected = c.id === selected.id;
    select.append(o);
  }
  const box = el('div', 'ranking-box');
  select.addEventListener('change', () => fillRanking(box, load(select.value)));
  fillRanking(box, load(selected.id));
  screen(root, el('h2', '', 'Ranking'), select, box, button('Wróć', onBack, true));
}

const SEND_MESSAGES: Record<SendResult, string> = {
  ok: 'Wynik zapisany.',
  'invalid-name': 'Ten nick jest niedozwolony. Wybierz inny.',
  rejected: 'Nie udało się zapisać wyniku.',
  'rate-limited': 'Za dużo prób. Spróbuj za minutę.',
  unavailable: 'Ranking jest chwilowo niedostępny. Wynik zachowano.',
};

function scoreForm(defaultName: string, send: (player: string) => Promise<SendResult>): HTMLFormElement {
  const form = el('form', 'score-form');
  const input = el('input');
  input.maxLength = 20;
  input.required = true;
  input.placeholder = 'Nick';
  input.value = defaultName;
  input.setAttribute('aria-label', 'Nick');
  const submit = el('button', '', 'Wyślij');
  submit.type = 'submit';
  const status = el('p', 'hint', 'Nick będzie widoczny publicznie. Nie podawaj imienia i nazwiska.');
  status.setAttribute('role', 'status');
  form.append(input, submit, status);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const player = input.value.trim();
    if (!player) return;
    submit.disabled = input.disabled = true;
    const r = await send(player);
    status.textContent = SEND_MESSAGES[r];
    status.className = r === 'ok' ? 'hint' : 'warn';
    if (r === 'ok' || r === 'rejected') return;
    submit.disabled = input.disabled = false;
    submit.textContent = r === 'invalid-name' ? 'Wyślij' : 'Spróbuj ponownie';
  });
  return form;
}

export function showRound(root: HTMLElement): {
  area: HTMLDivElement;
  canvas: HTMLCanvasElement;
  pauseButton: HTMLButtonElement;
} {
  const area = el('div', 'game');
  const canvas = el('canvas');
  const pauseButton = el('button', 'pause-button', 'II');
  pauseButton.setAttribute('aria-label', 'Pauza');
  pauseButton.tabIndex = -1;
  pauseButton.addEventListener('pointerdown', e => e.stopPropagation());
  area.append(canvas, pauseButton);
  root.replaceChildren(area);
  return { area, canvas, pauseButton };
}

export function showPause(area: HTMLElement, actions: { onResume: () => void; onExit: () => void }): void {
  const exit = button('Wyjdź do menu', () => {
    if (exit.dataset.confirm) {
      o.remove();
      actions.onExit();
      return;
    }
    exit.dataset.confirm = '1';
    exit.textContent = 'Na pewno? Postęp mapy przepadnie';
  }, true);
  const o = overlay(
    area,
    el('h2', '', 'Pauza'),
    button('Wznów', () => {
      o.remove();
      actions.onResume();
    }),
    exit,
  );
}

function gradeList(notes: readonly { grade?: Grade }[], emptyTaps: number): HTMLUListElement {
  const counts: Record<Grade, number> = { perfect: 0, good: 0, ok: 0, miss: 0 };
  for (const n of notes) counts[n.grade ?? 'miss']++;
  const list = el('ul', 'stats');
  for (const g of ['perfect', 'good', 'ok', 'miss'] as const) list.append(el('li', '', `${g}: ${counts[g]}`));
  list.append(el('li', '', `puste kliknięcia: ${emptyTaps}`));
  return list;
}

export function showRoundResults(
  area: HTMLElement,
  chart: Chart,
  s: Readonly<SessionState>,
  onNext: () => void,
): void {
  const r = s.roundIndex;
  const o = overlay(
    area,
    el('h2', '', `Runda ${r + 1}: ${s.perRound[r]} pkt`),
    gradeList(s.results[r], s.emptyTaps[r]),
    el('p', 'hint', `Następna runda dokłada: ${instrumentsOf(chart, r + 1)}`),
    button('Następna runda', () => {
      o.remove();
      onNext();
    }),
  );
}

export function showMapResults(
  root: HTMLElement,
  chart: Chart,
  s: Readonly<SessionState>,
  newBest: boolean,
  defaultName: string,
  actions: {
    onSend: (player: string) => Promise<SendResult>;
    onRetry: () => void;
    onRanking: () => void;
    onMenu: () => void;
  },
): void {
  const rounds = el('ul', 'stats');
  s.perRound.forEach((p, k) => rounds.append(el('li', '', `Runda ${k + 1}: ${p} pkt`)));
  screen(
    root,
    el('h2', '', `${chart.title}: ${s.score} pkt`),
    ...(newBest ? [el('p', 'warn', 'Nowy rekord!')] : []),
    rounds,
    scoreForm(defaultName, actions.onSend),
    button('Zagraj ponownie', actions.onRetry),
    button('Ranking', actions.onRanking, true),
    button('Menu', actions.onMenu, true),
  );
}
