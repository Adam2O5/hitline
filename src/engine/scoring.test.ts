import { it, expect } from 'vitest';
import { roundScore } from './scoring.ts';

it('odejmuje karę za puste kliknięcia i nie schodzi poniżej zera', () => {
  expect(roundScore(['perfect', 'good', 'miss'], 0)).toBe(160);
  expect(roundScore(['perfect', 'good', 'miss'], 2)).toBe(140);
  expect(roundScore(['ok'], 5)).toBe(0);
});
