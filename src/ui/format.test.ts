import { expect, it } from 'vitest';
import { formatScore, toScale } from './format.ts';

const chart: any = { loops: 1, rounds: [{ play: [1, 2] }] }; // maxScore = 200

it('przelicza wynik na skalę x/10 z dwoma miejscami', () => {
  expect(formatScore(chart, 100)).toBe('5.00/10');
  expect(formatScore(chart, 200)).toBe('10.00/10');
  expect(formatScore(chart, 0)).toBe('0.00/10');
});

it('ogranicza do skali i obsługuje zerowe maksimum', () => {
  expect(toScale(500, 200)).toBe(10);
  expect(toScale(5, 0)).toBe(0);
});