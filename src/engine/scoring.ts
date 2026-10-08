import { CONFIG } from './config.ts';
import type { Grade } from './types.ts';

export function gradeFor(absDeltaMs: number): Grade {
  if (absDeltaMs <= CONFIG.windowsMs.perfect) return 'perfect';
  if (absDeltaMs <= CONFIG.windowsMs.good) return 'good';
  if (absDeltaMs <= CONFIG.windowsMs.ok) return 'ok';
  return 'miss';
}

export function roundScore(grades: readonly Grade[], emptyTaps: number): number {
  const pts = grades.reduce((s, g) => s + CONFIG.points[g], 0);
  return Math.max(0, pts - emptyTaps * CONFIG.emptyTapPenalty);
}

/** Udział zdobytych punktów w maksimum, ograniczony do [0, 1]. */
export function fraction(score: number, max: number): number {
  return max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
}
