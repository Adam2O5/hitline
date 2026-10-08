export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Wywołuje onFrame(k), k w [0, 1] po easing cubic-out. Przy ograniczeniu ruchu od razu k = 1. */
export function tween(duration: number, delay: number, onFrame: (k: number) => void): void {
  if (reducedMotion()) {
    onFrame(1);
    return;
  }
  onFrame(0);
  const start = performance.now() + delay;
  const step = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    onFrame(1 - (1 - t) ** 3);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}