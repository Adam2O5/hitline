import type { BackingNote, InstrumentId } from '../engine/types.ts';

const LOOKAHEAD = 0.12;     // s
const TICK_MS = 25;
const LATE_TOLERANCE = 0.01; // s

export type PlayFn = (inst: InstrumentId, when: number, pitch?: number) => void;

export class Scheduler {
  private idx: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private ctx: Pick<AudioContext, 'currentTime'>,
    private notes: readonly BackingNote[],   // posortowane rosnąco po time
    private songStart: number,
    private play: PlayFn,
    startIndex = 0,
  ) {
    this.idx = startIndex;
  }

  start(): void {
    if (this.timer !== null) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    while (this.idx < this.notes.length) {
      const n = this.notes[this.idx];
      const when = this.songStart + n.time;
      if (when > horizon) break;
      if (when >= now - LATE_TOLERANCE) this.play(n.instrument, when, n.pitch);
      this.idx++;
    }
  }
}
