import type { BackingNote } from '../engine/types.ts';

export function planResume(
  backing: readonly BackingNote[],
  pausePos: number,
  now: number,
  countdown: number,
): { songStart: number; startIndex: number } {
  const goAt = now + countdown;
  const from = backing.findIndex(n => n.time >= pausePos);
  return { songStart: goAt - pausePos, startIndex: from === -1 ? backing.length : from };
}
