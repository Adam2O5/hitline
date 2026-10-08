import { describe, expect, it } from 'vitest';
import { FLASH_GAP, SHAKE_TIME, canFlash, fitFont, mulberry32, shakeEnvelope, shakeOffset } from './style.ts';

describe('shakeOffset', () => {
  it('zwraca zero dla reduced, ujemnego wieku i po SHAKE_TIME', () => {
    expect(shakeOffset(0.05, 'perfect', true)).toEqual([0, 0]);
    expect(shakeOffset(-0.1, 'perfect', false)).toEqual([0, 0]);
    expect(shakeOffset(SHAKE_TIME, 'perfect', false)).toEqual([0, 0]);
    expect(shakeOffset(SHAKE_TIME + 1, 'perfect', false)).toEqual([0, 0]);
  });

  it('puste kliknięcie i miss nie drżą', () => {
    expect(shakeOffset(0.05, 'empty', false)).toEqual([0, 0]);
    expect(shakeOffset(0.05, 'miss', false)).toEqual([0, 0]);
  });

  it('jest deterministyczne i zaczyna od pełnej amplitudy', () => {
    expect(shakeOffset(0, 'perfect', false)).toEqual([0, 5]);
    expect(shakeOffset(0.1, 'good', false)).toEqual(shakeOffset(0.1, 'good', false));
  });
});

describe('shakeEnvelope', () => {
  it('maleje monotonicznie i zależy od oceny', () => {
    let prev = Infinity;
    for (let age = 0; age < SHAKE_TIME; age += 0.02) {
      const e = shakeEnvelope(age, 'perfect');
      expect(e).toBeLessThanOrEqual(prev);
      prev = e;
    }
    expect(shakeEnvelope(0.05, 'perfect')).toBeGreaterThan(shakeEnvelope(0.05, 'good'));
    expect(shakeEnvelope(0.05, 'good')).toBeGreaterThan(shakeEnvelope(0.05, 'ok'));
  });
});

describe('fitFont', () => {
  it('nie zmienia rozmiaru, gdy tekst się mieści', () => {
    expect(fitFont(80, 78, 100)).toBe(78);
    expect(fitFont(100, 78, 100)).toBe(78);
  });
  it('zmniejsza proporcjonalnie i nie schodzi poniżej 1', () => {
    expect(fitFont(200, 78, 100)).toBe(39);
    expect(fitFont(1e9, 78, 1)).toBe(1);
  });
  it('ignoruje zerową szerokość', () => {
    expect(fitFont(0, 78, 100)).toBe(78);
  });
});

describe('mulberry32', () => {
  it('daje powtarzalną sekwencję z przedziału [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let k = 0; k < 100; k++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('canFlash', () => {
  it('pozwala na pierwszy błysk i wymusza odstęp FLASH_GAP', () => {
    expect(canFlash(-Infinity, 1)).toBe(true);
    expect(canFlash(1, 1 + FLASH_GAP - 0.01)).toBe(false);
    expect(canFlash(1, 1 + FLASH_GAP)).toBe(true);
  });

  it('przy nutach co 150 ms daje najwyżej 3 błyski na sekundę', () => {
    let prev = -Infinity, flashes = 0;
    for (let at = 0; at < 3; at += 0.15) {
      if (canFlash(prev, at)) { prev = at; flashes++; }
    }
    expect(flashes / 3).toBeLessThanOrEqual(3);
  });
});