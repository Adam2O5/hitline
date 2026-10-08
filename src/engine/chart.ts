import { CONFIG } from './config.ts';
import type { BackingNote, InstrumentId, PlayableNote } from './types.ts';

export interface Note {
  b: number;
  i: InstrumentId;
  p?: number;
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
      const note: BackingNote = { time: lead + sec(chart, loop * chart.lengthBeats + n.b), instrument: n.i };
      if (n.p !== undefined) note.pitch = n.p;
      out.push(note);
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

export function toBacking(chart: Chart, roundIndex: number, missed?: Set<number>): BackingNote[] {
  const out: BackingNote[] = [];
  for (let r = 0; r < roundIndex; r++) {
    const base = roundOffset(chart, r);
    expand(chart, chart.rounds[r].play).forEach((n, j) => {
      if (!missed?.has(base + j)) out.push(n);
    });
  }
  if (chart.ambient) out.push(...expand(chart, chart.ambient));
  return out.sort((a, b) => a.time - b.time);
}

export function roundDuration(chart: Chart): number {
  return sec(chart, chart.leadInBeats + chart.loops * chart.lengthBeats);
}

export function maxScore(chart: Chart): number {
  return roundOffset(chart, chart.rounds.length) * CONFIG.points.perfect;
}

export function roundMaxScore(chart: Chart, roundIndex: number): number {
  return (roundOffset(chart, roundIndex + 1) - roundOffset(chart, roundIndex)) * CONFIG.points.perfect;
}