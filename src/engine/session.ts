import { CONFIG } from './config.ts';
import { roundDuration, toPlayable, type Chart } from './chart.ts';
import { judgeTap, type TapResult } from './judge.ts';
import { roundScore } from './scoring.ts';
import type { ClockMethod } from './clock.ts';
import type { PlayableNote } from './types.ts';

export type Phase = 'playing' | 'paused' | 'countdown' | 'round-results';

export interface SessionState {
  chartId: string;
  roundIndex: number;
  phase: Phase;
  songStart: number;           // s, skala AudioContext
  frozenAt: number | null;
  notes: PlayableNote[];
  results: PlayableNote[][];
  emptyTaps: number[];
  perRound: number[];
  score: number;
  clockMethod: ClockMethod;
  calibrationOffset: number;   // s
}

export class Session {
  private state: SessionState;
  private chart: Chart;
  private missCursor = 0;
  private roundEnd = 0;        // s od songStart

  constructor(chart: Chart, clockMethod: ClockMethod, calibrationOffset: number) {
    this.chart = chart;
    const zeros = () => chart.rounds.map(() => 0);
    this.state = {
      chartId: chart.id,
      roundIndex: 0,
      phase: 'round-results',
      songStart: 0,
      frozenAt: null,
      notes: [],
      results: [],
      emptyTaps: zeros(),
      perRound: zeros(),
      score: 0,
      clockMethod,
      calibrationOffset,
    };
  }

  start(roundIndex: number, songStart: number): void {
    const notes = toPlayable(this.chart, roundIndex);
    const last = notes[notes.length - 1].time;
    this.roundEnd = Math.max(roundDuration(this.chart), last + CONFIG.windowsMs.ok / 1000);
    this.missCursor = 0;
    Object.assign(this.state, {
      roundIndex,
      phase: 'playing',
      songStart,
      frozenAt: null,
      notes,
    });
    this.state.emptyTaps[roundIndex] = 0;
  }

  pause(pausePos: number): void {
    const s = this.state;
    if (s.phase === 'playing') s.frozenAt = pausePos;
    else if (s.phase !== 'countdown') return;
    s.phase = 'paused';
  }

  beginCountdown(songStart: number): void {
    const s = this.state;
    if (s.phase !== 'paused') return;
    s.songStart = songStart;
    s.phase = 'countdown';
  }

  isLastRound(): boolean {
    return this.state.roundIndex === this.chart.rounds.length - 1;
  }

  onTap(tapTime: number): TapResult | null {
    const s = this.state;
    if (s.phase !== 'playing') return null;
    const r = judgeTap(tapTime, s.songStart, s.notes);
    if (r.kind === 'empty') s.emptyTaps[s.roundIndex]++;
    return r;
  }

  update(now: number): void {
    const s = this.state;
    const t = now - s.songStart;
    if (s.phase === 'countdown' && s.frozenAt !== null && t >= s.frozenAt) {
      s.phase = 'playing';
      s.frozenAt = null;
    }
    if (s.phase !== 'playing') return;
    const w = CONFIG.windowsMs.ok / 1000;
    while (this.missCursor < s.notes.length && t > s.notes[this.missCursor].time + w) {
      const n = s.notes[this.missCursor];
      if (!n.hit) n.grade = 'miss';
      this.missCursor++;
    }
    if (t >= this.roundEnd) this.closeRound();
  }

  getState(): Readonly<SessionState> {
    return this.state;
  }

  private closeRound(): void {
    const s = this.state;
    for (const n of s.notes) if (!n.hit) n.grade = 'miss';
    s.results[s.roundIndex] = s.notes;
    s.perRound[s.roundIndex] = roundScore(s.notes.map(n => n.grade ?? 'miss'), s.emptyTaps[s.roundIndex]);
    s.score = s.perRound.reduce((a, b) => a + b, 0);
    s.phase = 'round-results';
  }
}
