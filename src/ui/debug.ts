import type { ClockMethod } from '../engine/clock.ts';
import { el } from './dom.ts';

const REFRESH_MS = 500;

export function startDebugOverlay(
  ctx: AudioContext,
  info: () => { method: ClockMethod; offset: number },
): void {
  const box = el('div', 'debug');
  document.body.append(box);

  let frames = 0;
  let last = performance.now();
  const ms = (s: number | undefined) => (s === undefined ? 'n/d' : `${(s * 1000).toFixed(1)} ms`);

  const frame = (t: number) => {
    frames++;
    if (t - last >= REFRESH_MS) {
      const { method, offset } = info();
      box.textContent = [
        `baseLatency:   ${ms(ctx.baseLatency)}`,
        `outputLatency: ${ms(ctx.outputLatency)}`,
        `zegar:         ${method}`,
        `offset:        ${ms(offset)}`,
        `FPS:           ${Math.round((frames * 1000) / (t - last))}`,
      ].join('\n');
      frames = 0;
      last = t;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
