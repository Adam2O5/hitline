import { it, expect } from 'vitest';
import { maxScore, roundDuration, roundOffset, toPlayable } from './chart.ts';

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
