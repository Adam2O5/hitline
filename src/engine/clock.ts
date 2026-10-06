export type ClockMethod = 'output-timestamp' | 'current-time';

export type ClockSource = Pick<AudioContext, 'currentTime' | 'getOutputTimestamp'>;

function outputTimestampWorks(ctx: ClockSource): boolean {
  if (typeof ctx.getOutputTimestamp !== 'function') return false;
  const { contextTime, performanceTime } = ctx.getOutputTimestamp();
  return contextTime !== undefined && performanceTime !== undefined && performanceTime > 0;
}

export async function detectClockMethod(ctx: ClockSource): Promise<ClockMethod> {
  if (outputTimestampWorks(ctx)) return 'output-timestamp';
  await new Promise(r => setTimeout(r, 100));
  return outputTimestampWorks(ctx) ? 'output-timestamp' : 'current-time';
}

export function eventToAudioTime(
  ctx: ClockSource,
  e: Pick<Event, 'timeStamp'>,
  method: ClockMethod,
): number {
  if (method === 'output-timestamp') {
    const { contextTime, performanceTime } = ctx.getOutputTimestamp();
    return contextTime! + (e.timeStamp - performanceTime!) / 1000;
  }
  const ageSec = (performance.now() - e.timeStamp) / 1000;
  return ctx.currentTime - ageSec;
}
