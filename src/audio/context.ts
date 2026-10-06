let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

export async function unlock(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state !== 'running') await c.resume();
  return c;
}
