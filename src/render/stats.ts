/** Czas wykonania JS w Renderer.draw (bez rasteryzacji canvasu przez GPU); odczytywany przez ekran debug. */
export const drawStats = { avg: 0, max: 0 };

export function recordDraw(ms: number): void {
  drawStats.avg += (ms - drawStats.avg) * 0.05;   // średnia wykładnicza
  drawStats.max = Math.max(ms, drawStats.max * 0.99); // maksimum z powolnym zanikiem
}
