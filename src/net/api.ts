import { roundOffset, type Chart } from '../engine/chart.ts';
import type { SessionState } from '../engine/session.ts';
import type { ScorePayload } from '../engine/types.ts';

const PENDING_KEY = 'hitline.pending';
const PLAYER_KEY = 'hitline.player';
const TIMEOUT_MS = 8000;

export type LeaderboardRow = { player: string; score: number };
export type SendResult = 'ok' | 'invalid-name' | 'rejected' | 'rate-limited' | 'unavailable';

export function buildScorePayload(chart: Chart, s: Readonly<SessionState>, player: string): ScorePayload {
  const hits: [number, number][] = [];
  s.results.forEach((notes, r) => {
    const base = roundOffset(chart, r);
    notes.forEach((n, j) => {
      if (n.hit && n.deltaMs !== undefined) hits.push([base + j, n.deltaMs]);
    });
  });
  return { chart: chart.id, player, score: s.score, hits, emptyTaps: [...s.emptyTaps] };
}

async function request(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null;
  }
}

export async function getLeaderboard(chartId: string): Promise<LeaderboardRow[] | null> {
  const r = await request(`/api/leaderboard?chart=${encodeURIComponent(chartId)}`);
  if (!r?.ok) return null;
  try {
    return (await r.json()) as LeaderboardRow[];
  } catch {
    return null;
  }
}

export type CreateChallengeResult = { ok: true; code: string } | { ok: false; reason: 'rate-limited' | 'unavailable' };
export type ChallengeLookup = { ok: true; chartId: string } | { ok: false; reason: 'not-found' | 'unavailable' };

const CODE_RE = /^[A-Z0-9]{6}$/;

export function parseChallengeCode(raw: string | null): string | null {
  const code = raw?.trim().toUpperCase() ?? '';
  return code ? code : null;
}

export async function createChallenge(chartId: string): Promise<CreateChallengeResult> {
  const r = await request('/api/challenges', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chart: chartId }),
  });
  if (r?.status === 429) return { ok: false, reason: 'rate-limited' };
  if (r?.status !== 201) return { ok: false, reason: 'unavailable' };
  const body = (await r.json().catch(() => null)) as { code?: unknown } | null;
  return typeof body?.code === 'string' && CODE_RE.test(body.code)
    ? { ok: true, code: body.code }
    : { ok: false, reason: 'unavailable' };
}

export async function getChallenge(code: string): Promise<ChallengeLookup> {
  if (!CODE_RE.test(code)) return { ok: false, reason: 'not-found' };
  const r = await request(`/api/challenges/${code}`);
  if (r?.status === 404) return { ok: false, reason: 'not-found' };
  if (!r?.ok) return { ok: false, reason: 'unavailable' };
  const body = (await r.json().catch(() => null)) as { chart?: unknown } | null;
  return typeof body?.chart === 'string' ? { ok: true, chartId: body.chart } : { ok: false, reason: 'unavailable' };
}

export async function postScore(payload: ScorePayload, storage: Storage = localStorage): Promise<SendResult> {
  const r = await request('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await classify(r);
  if (result === 'rate-limited' || result === 'unavailable') savePending(payload, storage);
  else clearPending(storage);
  return result;
}

async function classify(r: Response | null): Promise<SendResult> {
  if (!r) return 'unavailable';
  if (r.status === 201) return 'ok';
  if (r.status === 429) return 'rate-limited';
  if (r.status === 400) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    return body?.error === 'invalid-name' ? 'invalid-name' : 'rejected';
  }
  return 'unavailable';
}

export function savePending(payload: ScorePayload, storage: Storage = localStorage): void {
  try {
    storage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    // brak pamięci lokalnej: wynik przepada
  }
}

export function loadPending(storage: Storage = localStorage): ScorePayload | null {
  try {
    const raw = storage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as ScorePayload) : null;
  } catch {
    return null;
  }
}

function clearPending(storage: Storage): void {
  try {
    storage.removeItem(PENDING_KEY);
  } catch {
    // ignorowane
  }
}

export async function retryPending(storage: Storage = localStorage): Promise<SendResult | null> {
  const p = loadPending(storage);
  return p ? postScore(p, storage) : null;
}

export function loadPlayer(storage: Storage = localStorage): string {
  try {
    return storage.getItem(PLAYER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayer(name: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(PLAYER_KEY, name);
  } catch {
    // ignorowane
  }
}
