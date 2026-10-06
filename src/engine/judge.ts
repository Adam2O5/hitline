import { CONFIG } from './config.ts';
import { gradeFor } from './scoring.ts';
import type { Grade, InstrumentId, PlayableNote } from './types.ts';

export type TapResult =
  | { kind: 'hit'; note: PlayableNote; deltaMs: number; grade: Grade }
  | { kind: 'empty'; instrument: InstrumentId; pitch?: number };

export function judgeTap(
  tapTime: number,          // czas kliknięcia, skala audio, po korekcie kalibracji
  songStart: number,
  notes: PlayableNote[],    // posortowane rosnąco po time, niepuste
): TapResult {
  const w = CONFIG.windowsMs.ok;
  for (const n of notes) {
    if (n.hit || n.grade === 'miss') continue;
    const deltaMs = Math.round((tapTime - (songStart + n.time)) * 1000);
    if (deltaMs < -w) break;
    if (deltaMs <= w) {
      const grade = gradeFor(Math.abs(deltaMs));
      n.hit = true;
      n.grade = grade;
      n.deltaMs = deltaMs;
      return { kind: 'hit', note: n, deltaMs, grade };
    }
  }
  const near = nearestNote(tapTime - songStart, notes);
  return near.pitch === undefined
    ? { kind: 'empty', instrument: near.instrument }
    : { kind: 'empty', instrument: near.instrument, pitch: near.pitch };
}

function nearestNote(t: number, notes: PlayableNote[]): PlayableNote {
  let best = notes[0];
  for (const n of notes) if (Math.abs(n.time - t) < Math.abs(best.time - t)) best = n;
  return best;
}
