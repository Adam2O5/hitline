import { describe, expect, it } from 'vitest';
import { isBlockedName, normalizeName } from './blocklist.ts';

describe('blocklist', () => {
  it('normalizuje wielkość liter, diakrytyki, podmiany i separatory', () => {
    expect(normalizeName('Ł0dź_K-4.T 5')).toBe('lodzkats');
  });

  it('wykrywa słowa także z podmianami i separatorami', () => {
    expect(isBlockedName('KURWA')).toBe(true);
    expect(isBlockedName('xx_kurw4_xx')).toBe(true);
    expect(isBlockedName('f.u.c.k')).toBe(true);
    expect(isBlockedName('Sh1tHead')).toBe(true);
  });

  it('krótkie słowa blokuje tylko jako cały nick', () => {
    expect(isBlockedName('ass')).toBe(true);
    expect(isBlockedName('A55')).toBe(true);
    expect(isBlockedName('Glass')).toBe(false);
    expect(isBlockedName('Cumulus')).toBe(false);
  });

  it('przepuszcza zwykłe nicki', () => {
    for (const n of ['Ania', 'Zażółć', 'player_01', 'Beat Master', 'Jan.K']) expect(isBlockedName(n)).toBe(false);
  });
});
