import { describe, it, expect } from 'vitest';
import charts from '../../charts/index.ts';
import { maxScore, roundDuration, roundOffset, toBacking, toPlayable, type Chart } from './chart.ts';
import { validateChart, validateSpacing } from './validate.ts';

const base = (): Chart => ({
  version: 1,
  id: 'test-01',
  title: 'Test',
  bpm: 120,
  lengthBeats: 4,
  loops: 2,
  leadInBeats: 2,
  ambient: [{ b: 3, i: 'perc' }],
  rounds: [
    { play: [{ b: 0, i: 'kick808' }, { b: 2, i: 'kick808' }] },
    { play: [{ b: 1, i: 'snare' }] },
    { play: [{ b: 0.5, i: 'hat' }] },
    { play: [{ b: 0, i: 'bass808', p: 36 }] },
    { play: [{ b: 0, i: 'string', p: 60 }] },
  ],
});

describe('toBacking', () => {
  it('w rundzie 0 zawiera tylko ambient', () => {
    expect(toBacking(base(), 0).map(n => n.instrument)).toEqual(['perc', 'perc']);
  });

  it('kumuluje poprzednie rundy i sortuje po czasie', () => {
    const b = toBacking(base(), 2);
    expect(b.map(n => n.instrument)).toEqual(['kick808', 'snare', 'kick808', 'perc', 'kick808', 'snare', 'kick808', 'perc']);
    expect(b.every((n, k) => k === 0 || n.time >= b[k - 1].time)).toBe(true);
  });

  it('pomija nuty z missed według indeksu globalnego', () => {
    const b = toBacking(base(), 2, new Set([1, 4]));
    expect(b.filter(n => n.instrument === 'kick808')).toHaveLength(3);
    expect(b.filter(n => n.instrument === 'snare')).toHaveLength(1);
  });

  it('przenosi wysokość dźwięku', () => {
    expect(toBacking(base(), 4).find(n => n.instrument === 'bass808')?.pitch).toBe(36);
    expect(toPlayable(base(), 4)[0].pitch).toBe(60);
  });
});

describe('validateChart', () => {
  it('akceptuje poprawną mapę i mapy z repozytorium', () => {
    expect(validateChart(base()).ok).toBe(true);
    for (const c of Object.values(charts)) expect(validateChart(c), c.id).toMatchObject({ ok: true });
  });

  it('odrzuca nieznane pola, złą liczbę rund i nieznany instrument', () => {
    const r = validateChart({ ...base(), extra: 1, rounds: [{ play: [{ b: 0, i: 'gong' }] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some(e => e.includes('extra'))).toBe(true);
      expect(r.errors.some(e => e.startsWith('rounds'))).toBe(true);
    }
  });

  it('odrzuca p dla instrumentu bez wysokości i p spoza zakresu MIDI', () => {
    const c = base();
    c.rounds[0].play[0].p = 40;
    expect(validateChart(c)).toMatchObject({ ok: false });
    const d = base();
    d.rounds[3].play[0].p = 128;
    expect(validateChart(d)).toMatchObject({ ok: false });
  });

  it('odrzuca nuty poza pętlą i nieposortowane', () => {
    const c = base();
    c.rounds[0].play = [{ b: 2, i: 'kick808' }, { b: 0, i: 'kick808' }];
    c.rounds[1].play = [{ b: 4, i: 'snare' }];
    const r = validateChart(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });
});

describe('validateSpacing', () => {
  it('wykrywa zbyt gęste nuty', () => {
    const c = base();
    c.rounds[0].play = [{ b: 0, i: 'kick808' }, { b: 0.25, i: 'kick808' }];
    expect(validateSpacing(c)).toHaveLength(1);
  });

  it('sprawdza odstęp na granicy pętli', () => {
    const c = base();
    c.rounds[0].play = [{ b: 0, i: 'kick808' }, { b: 3.75, i: 'kick808' }];
    expect(validateSpacing(c)[0]).toContain('granicy pętli');
    c.loops = 1;
    expect(validateSpacing(c)).toEqual([]);
  });
});

it('konwertuje beaty na sekundy i rozwija pętle', () => {
  const chart: any = {
    bpm: 120, leadInBeats: 2, lengthBeats: 4, loops: 2,
    rounds: [{ play: [{ b: 1, i: 'snare' }] }],
  };
  const notes = toPlayable(chart, 0);
  expect(notes).toHaveLength(2);
  expect(notes[0].time).toBeCloseTo((2 + 1) * 0.5, 6);
  expect(notes[1].time).toBeCloseTo((2 + 4 + 1) * 0.5, 6);
  expect(notes.every(n => n.hit === false && n.instrument === 'snare')).toBe(true);
});

it('liczy maksymalny wynik z uwzględnieniem pętli', () => {
  const chart: any = { loops: 2, rounds: [{ play: [1, 2, 3] }, { play: [1, 2] }] };
  expect(maxScore(chart)).toBe(1000);
});

it('liczy przesunięcie indeksu globalnego rundy', () => {
  const chart: any = { loops: 2, rounds: [{ play: [1, 2, 3] }, { play: [1, 2] }, { play: [1] }] };
  expect(roundOffset(chart, 0)).toBe(0);
  expect(roundOffset(chart, 1)).toBe(6);
  expect(roundOffset(chart, 2)).toBe(10);
});

it('liczy czas trwania rundy z wprowadzeniem i pętlami', () => {
  const chart: any = { bpm: 90, leadInBeats: 4, lengthBeats: 4, loops: 4 };
  expect(roundDuration(chart)).toBeCloseTo((4 + 16) * 60 / 90, 6);
});
