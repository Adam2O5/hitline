import { expect, it } from 'vitest';
import { drawStats, recordDraw } from './stats.ts';

it('średnia zbiega do stałej wartości, a maksimum zanika po skoku', () => {
  drawStats.avg = 0;
  drawStats.max = 0;
  for (let k = 0; k < 200; k++) recordDraw(2);
  expect(drawStats.avg).toBeCloseTo(2, 1);
  recordDraw(20);
  expect(drawStats.max).toBe(20);
  for (let k = 0; k < 300; k++) recordDraw(2);
  expect(drawStats.max).toBeLessThan(3);
});
