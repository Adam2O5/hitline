import { CONFIG } from './config.ts';
import type { ClockMethod } from './clock.ts';

const MIN_PAIRS = 5;
const MAX_OFFSET = 0.3;
const STORAGE_KEY = 'hitline.calibration';

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Measurement {
  offset: number;            // s, ograniczony do +/- MAX_OFFSET
  spreadMs: number;          // mediana odchyleń bezwzględnych od mediany
  reliable: boolean;         // spreadMs <= CONFIG.calibrationMaxSpreadMs
}

export function measure(taps: number[], beats: number[], skipBeats = 2): Measurement | null {
  const interval = beats[1] - beats[0];          // metronom ma stały interwał
  const best = new Map<number, number>();        // indeks uderzenia -> d
  for (const t of taps) {
    const k = Math.round((t - beats[0]) / interval);
    if (k < skipBeats || k >= beats.length) continue;
    const d = t - beats[k];
    const prev = best.get(k);
    if (prev === undefined || Math.abs(d) < Math.abs(prev)) best.set(k, d);
  }
  if (best.size < MIN_PAIRS) return null;
  const ds = [...best.values()];
  const m = median(ds);
  const spreadMs = median(ds.map(d => Math.abs(d - m))) * 1000;
  return {
    offset: Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, m)),
    spreadMs,
    reliable: spreadMs <= CONFIG.calibrationMaxSpreadMs,
  };
}

export function computeOffset(taps: number[], beats: number[], skipBeats = 2): number | null {
  return measure(taps, beats, skipBeats)?.offset ?? null;
}

export type LoadResult =
  | { status: 'ok'; offset: number }
  | { status: 'missing' }
  | { status: 'method-changed' };

export function loadCalibration(
  method: ClockMethod,
  storage: Pick<Storage, 'getItem'> = localStorage,
): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'missing' };
  }
  if (raw === null) return { status: 'missing' };
  try {
    const v = JSON.parse(raw) as { offset?: unknown; method?: unknown };
    if (typeof v.offset !== 'number' || !Number.isFinite(v.offset) || Math.abs(v.offset) > MAX_OFFSET) {
      return { status: 'missing' };
    }
    if (v.method !== method) return { status: 'method-changed' };
    return { status: 'ok', offset: v.offset };
  } catch {
    return { status: 'missing' };
  }
}

export function saveCalibration(
  offset: number,
  method: ClockMethod,
  storage: Pick<Storage, 'setItem'> = localStorage,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ offset, method }));
    return true;
  } catch {
    return false;
  }
}
