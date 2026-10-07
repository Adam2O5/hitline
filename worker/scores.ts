import { CONFIG } from '../src/engine/config.ts';
import { maxScore, roundOffset, type Chart } from '../src/engine/chart.ts';
import { gradeFor, roundScore } from '../src/engine/scoring.ts';
import type { Grade } from '../src/engine/types.ts';
import { isBlockedName } from './blocklist.ts';

export const NAME_RE = /^[\p{L}\p{N} _\-.]{1,20}$/u;
const MAX_EMPTY_TAPS = 10_000;

export type ScoreCheck =
  | { ok: true; player: string; score: number }
  | { ok: false; error: 'invalid-name' | 'invalid' };

export function checkName(player: unknown): player is string {
  return typeof player === 'string' && player.trim() === player && NAME_RE.test(player) && !isBlockedName(player);
}

export function checkScore(chart: Chart, b: Record<string, unknown>): ScoreCheck {
  if (!checkName(b.player)) return { ok: false, error: 'invalid-name' };
  const { score, hits, emptyTaps } = b;
  if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > maxScore(chart)) {
    return { ok: false, error: 'invalid' };
  }
  const recomputed = recompute(chart, hits, emptyTaps);
  if (recomputed === null || recomputed !== score) return { ok: false, error: 'invalid' };
  return { ok: true, player: b.player, score: recomputed };
}

function recompute(chart: Chart, hits: unknown, emptyTaps: unknown): number | null {
  const rounds = chart.rounds.length;
  const total = roundOffset(chart, rounds);
  if (!Array.isArray(emptyTaps) || emptyTaps.length !== rounds) return null;
  if (!emptyTaps.every(n => Number.isInteger(n) && n >= 0 && n <= MAX_EMPTY_TAPS)) return null;
  if (!Array.isArray(hits) || hits.length > total) return null;

  const grades: Grade[] = new Array(total).fill('miss');
  const seen = new Set<number>();
  for (const h of hits) {
    if (!Array.isArray(h) || h.length !== 2) return null;
    const [idx, d] = h;
    if (!Number.isInteger(idx) || idx < 0 || idx >= total || seen.has(idx)) return null;
    if (!Number.isInteger(d) || Math.abs(d) > CONFIG.windowsMs.ok) return null;
    seen.add(idx);
    grades[idx] = gradeFor(Math.abs(d));
  }

  let sum = 0;
  for (let r = 0; r < rounds; r++) {
    sum += roundScore(grades.slice(roundOffset(chart, r), roundOffset(chart, r + 1)), emptyTaps[r]);
  }
  return sum;
}
