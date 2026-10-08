import { maxScore, type Chart } from '../engine/chart.ts';
import { fraction } from '../engine/scoring.ts';

export const SCALE = 100;

export const toScale = (score: number, max: number): number => fraction(score, max) * SCALE;

export const formatScore = (chart: Chart, score: number): string =>
  `${toScale(score, maxScore(chart)).toFixed(2)}/${SCALE}`;