import { it, expect } from 'vitest';
import { fraction, roundScore } from './scoring.ts';

it('odejmuje karę za puste kliknięcia i nie schodzi poniżej zera', () => {
  expect(roundScore(['perfect', 'good', 'miss'], 0)).toBe(160);
  expect(roundScore(['perfect', 'good', 'miss'], 2)).toBe(140);
  expect(roundScore(['ok'], 5)).toBe(0);
});

it('fraction ogranicza do [0, 1] i obsługuje zerowe maksimum', () => {
  expect(fraction(50, 200)).toBe(0.25);
  expect(fraction(300, 200)).toBe(1);
  expect(fraction(-5, 100)).toBe(0);
  expect(fraction(5, 0)).toBe(0);
});