import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from './scheduler.ts';
import type { BackingNote } from '../engine/types.ts';

const notes: BackingNote[] = [0, 0.1, 0.5, 1].map(time => ({ time, instrument: 'hat' }));

describe('Scheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('planuje nuty z wyprzedzeniem już przy starcie i w kolejnych tickach', () => {
    const ctx = { currentTime: 10 };
    const play = vi.fn();
    const s = new Scheduler(ctx, notes, 10, play);
    s.start();
    expect(play.mock.calls.map(c => c[1])).toEqual([10, 10.1]);

    ctx.currentTime = 10.45;
    vi.advanceTimersByTime(25);
    expect(play).toHaveBeenCalledTimes(3);
    expect(play).toHaveBeenLastCalledWith('hat', 10.5, undefined);
    s.stop();
  });

  it('zaczyna od startIndex i nie gra nut po stop', () => {
    const ctx = { currentTime: 0 };
    const play = vi.fn();
    const s = new Scheduler(ctx, notes, 0, play, 3);
    s.start();
    expect(play).not.toHaveBeenCalled();
    s.stop();
    ctx.currentTime = 1;
    vi.advanceTimersByTime(100);
    expect(play).not.toHaveBeenCalled();
  });

  it('pomija nuty spóźnione ponad tolerancję', () => {
    const ctx = { currentTime: 10.4 };
    const play = vi.fn();
    new Scheduler(ctx, notes, 10, play).start();
    expect(play.mock.calls.map(c => c[1])).toEqual([10.5]);
  });

  it('przekazuje wysokość dźwięku', () => {
    const play = vi.fn();
    new Scheduler({ currentTime: 0 }, [{ time: 0, instrument: 'bass808', pitch: 36 }], 0, play).start();
    expect(play).toHaveBeenCalledWith('bass808', 0, 36);
  });
});
