import { expect, it } from 'vitest';
import { planResume } from './pause.ts';
import type { BackingNote } from '../engine/types.ts';

const backing: BackingNote[] = [1, 2, 3].map(time => ({ time, instrument: 'kick808' }));

it('przesuwa songStart o odliczanie i wznawia od pierwszej nuty po pauzie', () => {
  expect(planResume(backing, 1.5, 50, 3)).toEqual({ songStart: 51.5, startIndex: 1 });
});

it('nuta dokładnie w punkcie pauzy jest zagrana po wznowieniu', () => {
  expect(planResume(backing, 2, 50, 3).startIndex).toBe(1);
});

it('po ostatniej nucie nie planuje niczego', () => {
  expect(planResume(backing, 3.5, 50, 3).startIndex).toBe(3);
});
