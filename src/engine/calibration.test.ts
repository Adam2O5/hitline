import { describe, it, expect } from 'vitest';
import { computeOffset, loadCalibration, measure, median, saveCalibration } from './calibration.ts';

describe('kalibracja', () => {
  it('mediana nieparzysta i parzysta', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  const beats = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('odrzuca rozgrzewkę i paruje stuknięcia z najbliższym uderzeniem', () => {
    const taps = [0.5, 1.4, 2.1, 3.1, 4.1, 6.1, 7.1, 7.3, 8.1, 9.1]; // brak stuknięcia przy 5, podwójne przy 7
    expect(computeOffset(taps, beats, 2)).toBeCloseTo(0.1, 3);
  });

  it('ucina do +/-0.3 s', () => {
    expect(computeOffset(beats.map(b => b + 0.4), beats, 2)).toBe(0.3);
  });

  it('odrzuca pomiar przy zbyt małej liczbie par', () => {
    expect(computeOffset([2.1, 3.1, 4.1], beats, 2)).toBeNull();
  });

  it('oznacza pomiar o dużym rozrzucie jako niepewny', () => {
    const steady = measure(beats.map(b => b + 0.05), beats)!;
    expect(steady.reliable).toBe(true);
    const noisy = measure(beats.map((b, k) => b + (k % 2 ? 0.15 : -0.05)), beats)!;
    expect(noisy.spreadMs).toBeCloseTo(100, 3);
    expect(noisy.reliable).toBe(false);
  });
});

describe('zapis kalibracji', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it('zapisuje i odczytuje offset dla tej samej metody', () => {
    const st = memory();
    expect(saveCalibration(0.042, 'output-timestamp', st)).toBe(true);
    expect(loadCalibration('output-timestamp', st)).toEqual({ status: 'ok', offset: 0.042 });
  });

  it('unieważnia offset przy innej metodzie zegara', () => {
    const st = memory();
    saveCalibration(0.042, 'output-timestamp', st);
    expect(loadCalibration('current-time', st)).toEqual({ status: 'method-changed' });
  });

  it('traktuje brak, uszkodzone dane i błąd storage jako brak kalibracji', () => {
    expect(loadCalibration('current-time', memory())).toEqual({ status: 'missing' });
    const bad = memory();
    bad.setItem('hitline.calibration', '{nie-json');
    expect(loadCalibration('current-time', bad)).toEqual({ status: 'missing' });
    const throwing = { getItem: () => { throw new Error('denied'); } };
    expect(loadCalibration('current-time', throwing)).toEqual({ status: 'missing' });
    const full = { setItem: () => { throw new Error('quota'); } };
    expect(saveCalibration(0.01, 'current-time', full)).toBe(false);
  });
});
