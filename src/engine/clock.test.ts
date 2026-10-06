import { afterEach, describe, it, expect, vi } from 'vitest';
import { detectClockMethod, eventToAudioTime, type ClockSource } from './clock.ts';

const source = (currentTime: number, ts?: () => AudioTimestamp): ClockSource =>
  ({ currentTime, getOutputTimestamp: ts }) as unknown as ClockSource;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('detectClockMethod', () => {
  it('wybiera getOutputTimestamp, gdy zwraca poprawne wartości', async () => {
    const ctx = source(1, () => ({ contextTime: 1, performanceTime: 5000 }));
    expect(await detectClockMethod(ctx)).toBe('output-timestamp');
  });

  it('ponawia próbę, gdy performanceTime jest jeszcze 0', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const ctx = source(1, () => ({ contextTime: 1, performanceTime: calls++ === 0 ? 0 : 5000 }));
    const p = detectClockMethod(ctx);
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBe('output-timestamp');
  });

  it('wybiera metodę zapasową, gdy API nie istnieje', async () => {
    vi.useFakeTimers();
    const p = detectClockMethod(source(1));
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBe('current-time');
  });
});

describe('eventToAudioTime', () => {
  it('mapuje przez getOutputTimestamp', () => {
    const ctx = source(10.5, () => ({ contextTime: 10, performanceTime: 5000 }));
    expect(eventToAudioTime(ctx, { timeStamp: 4900 }, 'output-timestamp')).toBeCloseTo(9.9, 6);
  });

  it('metoda zapasowa odejmuje wiek zdarzenia od currentTime', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const ctx = source(10);
    expect(eventToAudioTime(ctx, { timeStamp: 4950 }, 'current-time')).toBeCloseTo(9.95, 6);
  });
});
