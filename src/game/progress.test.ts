import { expect, it } from 'vitest';
import { loadBest, saveBest } from './progress.ts';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

it('zapisuje tylko lepszy wynik', () => {
  const s = memory();
  expect(loadBest('demo-01', s)).toBeNull();
  expect(saveBest('demo-01', 500, s)).toBe(true);
  expect(saveBest('demo-01', 400, s)).toBe(false);
  expect(saveBest('demo-01', 500, s)).toBe(false);
  expect(saveBest('demo-01', 700, s)).toBe(true);
  expect(loadBest('demo-01', s)).toBe(700);
});

it('nie zapisuje zera i odrzuca uszkodzone wartości', () => {
  const s = memory();
  expect(saveBest('a', 0, s)).toBe(false);
  s.setItem('hitline.best.a', 'abc');
  expect(loadBest('a', s)).toBeNull();
});

it('nie rzuca, gdy pamięć jest niedostępna', () => {
  const broken = { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } };
  expect(loadBest('a', broken)).toBeNull();
  expect(saveBest('a', 10, broken)).toBe(true);
});
