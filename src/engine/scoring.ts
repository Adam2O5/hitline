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
