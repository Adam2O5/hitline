import { CONFIG } from './config.ts';
import type { BackingNote, InstrumentId, PlayableNote } from './types.ts';

export interface Note {
  b: number;                 // pozycja w beatach od początku pętli (>= 0, < lengthBeats)
  i: InstrumentId;
}

export interface Round {
  play: Note[];
}

export interface Chart {
  version: 1;
  id: string;
  title: string;
  bpm: number;
  lengthBeats: number;
  loops: number;
  leadInBeats: number;
  ambient?: Note[];
  rounds: Round[];
}

export const sec = (chart: Chart, b: number) => (b * 60) / chart.bpm;

function expand(chart: Chart, notes: Note[]): BackingNote[] {
  const lead = sec(chart, chart.leadInBeats);
  const out: BackingNote[] = [];
  for (let loop = 0; loop < chart.loops; loop++) {
    for (const n of notes) {
      out.push({ time: lead + sec(chart, loop * chart.lengthBeats + n.b), instrument: n.i });
    }
  }
  return out;
}

export function toPlayable(chart: Chart, roundIndex: number): PlayableNote[] {
  return expand(chart, chart.rounds[roundIndex].play).map(n => ({ ...n, hit: false }));
}

export function roundOffset(chart: Chart, roundIndex: number): number {
  return chart.rounds.slice(0, roundIndex).reduce((s, r) => s + r.play.length * chart.loops, 0);
}

export function roundDuration(chart: Chart): number {
  return sec(chart, chart.leadInBeats + chart.loops * chart.lengthBeats);
}

export function maxScore(chart: Chart): number {
  return roundOffset(chart, chart.rounds.length) * CONFIG.points.perfect;
}
