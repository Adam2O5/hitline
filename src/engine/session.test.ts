import { describe, it, expect } from 'vitest';
import { Session } from './session.ts';
import type { Chart } from './chart.ts';

const chart: Chart = {
  version: 1,
  id: 'test',
  title: 'Test',
  bpm: 60,
  lengthBeats: 4,
  loops: 1,
  leadInBeats: 2,
  rounds: Array.from({ length: 5 }, () => ({
    play: [{ b: 0, i: 'kick808' as const }, { b: 2, i: 'snare' as const }],
  })),
};

const START = 10;

describe('Session', () => {
  it('ocenia trafienia, liczy puste kliknięcia i zamyka rundę z karą', () => {
    const s = new Session(chart, 'current-time', 0);
    s.start(0, START);

    expect(s.onTap(START + 2.02)).toMatchObject({ kind: 'hit', grade: 'perfect' });
    expect(s.onTap(START + 3)).toMatchObject({ kind: 'empty' });
    expect(s.getState().emptyTaps[0]).toBe(1);

    s.update(START + 4.2);
    expect(s.getState().notes[1].grade).toBe('miss');
    expect(s.getState().phase).toBe('playing');

    s.update(START + 6);
    const st = s.getState();
    expect(st.phase).toBe('round-results');
    expect(st.perRound[0]).toBe(90);
    expect(st.score).toBe(90);
    expect(st.results[0].map(n => n.grade)).toEqual(['perfect', 'miss']);
  });

  it('nie oznacza miss przed końcem okna', () => {
    const s = new Session(chart, 'current-time', 0);
    s.start(0, START);
    s.update(START + 2.14);
    expect(s.getState().notes[0].grade).toBeUndefined();
    expect(s.onTap(START + 2.14)).toMatchObject({ kind: 'hit', grade: 'ok' });
  });

  it('ignoruje kliknięcia poza fazą playing', () => {
    const s = new Session(chart, 'current-time', 0);
    expect(s.onTap(START)).toBeNull();
    s.start(0, START);
    s.update(START + 6);
    expect(s.onTap(START + 6.1)).toBeNull();
    expect(s.getState().emptyTaps[0]).toBe(0);
  });

  it('kara nie obniża wyniku rundy poniżej zera', () => {
    const s = new Session(chart, 'current-time', 0);
    s.start(0, START);
    for (let k = 0; k < 20; k++) s.onTap(START + 0.5);
    s.update(START + 6);
    expect(s.getState().perRound[0]).toBe(0);
  });

  it('kończy rundę po ostatniej pętli, nie po ostatniej nucie', () => {
    const s = new Session(chart, 'current-time', 0);
    s.start(0, START);
    s.update(START + 5);
    expect(s.getState().phase).toBe('playing');
    s.update(START + 6);
    expect(s.getState().phase).toBe('round-results');
  });

  it('zachowuje wyniki poprzednich rund', () => {
    const s = new Session(chart, 'current-time', 0);
    s.start(0, START);
    s.onTap(START + 2);
    s.update(START + 6);
    s.start(1, 20);
    s.onTap(20 + 4);
    s.update(20 + 6);
    const st = s.getState();
    expect(st.results).toHaveLength(2);
    expect(st.results[0].map(n => n.grade)).toEqual(['perfect', 'miss']);
    expect(st.results[1].map(n => n.grade)).toEqual(['miss', 'perfect']);
    expect(st.score).toBe(200);
  });

  it('zamraża pozycję na pauzie i wznawia grę po odliczaniu', () => {
    const s = new Session(chart, 'current-time', 0);
    s.start(0, START);
    s.pause(1.5);
    expect(s.getState()).toMatchObject({ phase: 'paused', frozenAt: 1.5 });
    expect(s.onTap(START + 1.5)).toBeNull();

    const songStart = 100 + 3 - 1.5;
    s.beginCountdown(songStart);
    s.update(100 + 1);
    expect(s.getState().phase).toBe('countdown');
    expect(s.onTap(100 + 1)).toBeNull();

    s.update(100 + 3);
    expect(s.getState()).toMatchObject({ phase: 'playing', frozenAt: null });
    expect(s.onTap(songStart + 2)).toMatchObject({ kind: 'hit', grade: 'perfect' });
  });

  it('pauza w trakcie odliczania zachowuje pierwotną pozycję', () => {
    const s = new Session(chart, 'current-time', 0);
    s.start(0, START);
    s.pause(1.5);
    s.beginCountdown(101.5);
    s.pause(-1);
    expect(s.getState()).toMatchObject({ phase: 'paused', frozenAt: 1.5 });
  });

  it('ignoruje pauzę poza grą', () => {
    const s = new Session(chart, 'current-time', 0);
    s.pause(1);
    expect(s.getState().phase).toBe('round-results');
  });
});
