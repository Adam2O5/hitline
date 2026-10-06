import { describe, it, expect } from 'vitest';
import { judgeTap } from './judge.ts';
import { gradeFor } from './scoring.ts';
import type { PlayableNote } from './types.ts';

describe('gradeFor', () => {
  it('klasyfikuje progi (ms)', () => {
    expect(gradeFor(0)).toBe('perfect');
    expect(gradeFor(40)).toBe('perfect');
    expect(gradeFor(41)).toBe('good');
    expect(gradeFor(90)).toBe('good');
    expect(gradeFor(91)).toBe('ok');
    expect(gradeFor(150)).toBe('ok');
    expect(gradeFor(151)).toBe('miss');
  });
});

describe('judgeTap', () => {
  const mk = (time: number): PlayableNote => ({ time, instrument: 'snare', hit: false });

  it('trafia nutę, której okno obejmuje kliknięcie', () => {
    const notes = [mk(1.0), mk(2.0)];
    const r = judgeTap(2.02, 0, notes);
    expect(r.kind).toBe('hit');
    if (r.kind !== 'hit') return;
    expect(r.note).toBe(notes[1]);
    expect(r.grade).toBe('perfect');
    expect(notes[1].hit).toBe(true);
  });

  it('przy dwóch nutach w oknie wybiera wcześniejszą, nie bliższą', () => {
    const notes = [mk(1.0), mk(1.15)];
    const r = judgeTap(1.10, 0, notes);
    expect(r.kind === 'hit' && r.note).toBe(notes[0]);
    expect(r.kind === 'hit' && r.grade).toBe('ok');
  });

  it('poza oknem zwraca puste kliknięcie z instrumentem najbliższej nuty', () => {
    const notes = [mk(1.0), { ...mk(2.0), instrument: 'hat' as const }];
    expect(judgeTap(1.8, 0, notes)).toEqual({ kind: 'empty', instrument: 'hat' });
    expect(notes[0].hit).toBe(false);
  });

  it('nie zalicza tej samej nuty dwa razy', () => {
    const notes = [mk(1.0)];
    expect(judgeTap(1.0, 0, notes).kind).toBe('hit');
    expect(judgeTap(1.0, 0, notes).kind).toBe('empty');
  });

  it('nie dopasowuje nuty oznaczonej jako miss', () => {
    const notes = [{ ...mk(1.0), grade: 'miss' as const }];
    expect(judgeTap(1.0, 0, notes).kind).toBe('empty');
  });

  it('ocenia na delcie zaokrąglonej do ms i zapisuje ją w nucie', () => {
    const a = [mk(1.0)];
    const ra = judgeTap(1.0404, 0, a);
    expect(ra.kind === 'hit' && ra.grade).toBe('perfect');
    expect(a[0].deltaMs).toBe(40);
    const b = [mk(1.0)];
    const rb = judgeTap(1.0406, 0, b);
    expect(rb.kind === 'hit' && rb.grade).toBe('good');
  });

  it('uwzględnia songStart', () => {
    const notes = [mk(1.0)];
    const r = judgeTap(11.01, 10, notes);
    expect(r.kind === 'hit' && r.deltaMs).toBe(10);
  });
});
