import { PARAMS, play } from '../audio/synth.ts';
import type { InstrumentId } from '../engine/types.ts';
import { button, el } from './dom.ts';
import { INSTRUMENT_NAMES } from './labels.ts';

const STORAGE_KEY = 'hitline.tuning';
const DEFAULTS = structuredClone(PARAMS);

type Params = Record<string, Record<string, number>>;

function apply(saved: Params): void {
  const target = PARAMS as Params;
  for (const [inst, values] of Object.entries(saved)) {
    if (!Object.hasOwn(target, inst)) continue;
    for (const [k, v] of Object.entries(values)) {
      if (Object.hasOwn(target[inst], k) && Number.isFinite(v)) target[inst][k] = v;
    }
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(PARAMS));
  } catch {
    // podgląd strojenia działa także bez zapisu
  }
}

export function loadTuning(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) apply(JSON.parse(raw) as Params);
  } catch {
    // uszkodzony zapis: zostają wartości domyślne
  }
}

const decimals = (v: number) => (v >= 100 ? 0 : v >= 1 ? 2 : 3);

function slider(inst: string, key: string): HTMLLabelElement {
  const params = (PARAMS as Params)[inst];
  const base = (DEFAULTS as Params)[inst][key];
  const input = el('input');
  input.type = 'range';
  input.min = String(base / 4);
  input.max = String(base * 4);
  input.step = String(base / 100);
  input.value = String(params[key]);
  const value = el('span', 'tuning-value', params[key].toFixed(decimals(base)));
  input.addEventListener('input', () => {
    params[key] = Number(input.value);
    value.textContent = params[key].toFixed(decimals(base));
    persist();
  });
  const label = el('label', 'tuning-row');
  label.append(el('span', '', key), input, value);
  return label;
}

export function startTuningPanel(ctx: AudioContext): void {
  loadTuning();
  const panel = el('div', 'tuning');
  panel.hidden = true;
  const toggle = el('button', 'tuning-toggle', 'Strojenie');
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
  });

  const render = () => {
    const output = el('textarea', 'tuning-json');
    output.readOnly = true;
    output.rows = 6;
    const sections = (Object.keys(PARAMS) as InstrumentId[]).map(inst => {
      const fs = el('fieldset');
      fs.append(
        el('legend', '', INSTRUMENT_NAMES[inst]),
        ...Object.keys((PARAMS as Params)[inst]).map(k => slider(inst, k)),
        button('Odsłuchaj', () => play(inst, ctx.currentTime + 0.05), true),
      );
      return fs;
    });
    panel.replaceChildren(
      el('h3', '', 'Strojenie syntezy'),
      el('p', 'hint', 'Zmiany działają od razu i są zapamiętywane w tej przeglądarce. Gotowe wartości skopiuj z pola na dole.'),
      ...sections,
      button('Pokaż wartości (JSON)', () => {
        output.value = JSON.stringify(PARAMS, null, 2);
        output.select();
      }),
      output,
      button('Przywróć domyślne', () => {
        apply(structuredClone(DEFAULTS));
        persist();
        render();
      }, true),
      button('Zamknij', () => { panel.hidden = true; }, true),
    );
  };

  document.body.append(toggle, panel);
}
